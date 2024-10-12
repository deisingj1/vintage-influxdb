import axios from "axios";
import fs from "fs";
import path from "path";
import writeToDb from "../influxDb/writeToDb";
import { requestRefreshedAccessToken } from "../spotifyAuth/spotifyAuth";
import { Measurer } from "../utils/measureDuration";
import { LRUCache } from "lru-cache";

let projectPath = "";
if (process.env.TS_NODE_DEV == "true") {
  projectPath = path.join(__dirname, "..", "..", "spotifyKeys.json");
} else {
  projectPath = path.join(__dirname, "..", "..", "..", "spotifyKeys.json");
}

let currentAccessToken = "";
let currentRefreshToken = "";
let running = false;

function getCurrentlyPlaying() {
  // console.debug("Getting player status");
  return axios.get("https://api.spotify.com/v1/me/player", {
    headers: {
      Authorization: `Bearer ${currentAccessToken}`,
    },
  });
}

const audioFeaturesCache: LRUCache<string, TrackFeatures> = new LRUCache({max: 500});
function getAudioFeatures(id: string): () => Promise<TrackFeatures> {
  return async () => {
    if (audioFeaturesCache.has(id)) {
      return Promise.resolve(audioFeaturesCache.get(id) as TrackFeatures);
    }

    console.debug(`Getting audio features for track ${id}`);
    const response = await axios
      .get(`https://api.spotify.com/v1/audio-features/${id}`, {
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
        },
      });
    audioFeaturesCache.set(id, response.data as TrackFeatures);
    return response.data as TrackFeatures;
  }
}

const artistInfoCache: LRUCache<string, ArtistInfo> = new LRUCache({max: 200});
function getArtistInfo(id: string): () => Promise<ArtistInfo> {
  return async () => {
    if (artistInfoCache.has(id)) {
      return Promise.resolve(artistInfoCache.get(id) as ArtistInfo);
    }
  
    console.debug(`Getting artist info for artist ${id}`);
    const response = await axios
      .get(`https://api.spotify.com/v1/artists/${id}`, {
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
        },
      });
    artistInfoCache.set(id, response.data as ArtistInfo);
    return response.data as ArtistInfo;
  }
}

const albumInfoCache: LRUCache<string, AlbumInfo> = new LRUCache({max: 200});
function getAlbumInfo(id: string): () => Promise<AlbumInfo> {
  return async () => {
    if (albumInfoCache.has(id)) {
      return Promise.resolve(albumInfoCache.get(id) as AlbumInfo);
    }

    console.debug(`Getting album info for album ${id}`);
    const response = await axios
      .get(`https://api.spotify.com/v1/albums/${id}`, {
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
        },
      });
    albumInfoCache.set(id, response.data as AlbumInfo);
    return response.data as AlbumInfo;
  }
}

const durationMeasurer = new Measurer();

async function recordData(): Promise<void> {
  console.log("Starting to record data...");
  let appRunning = false;

  while (running) {
    try {
      const response = await getCurrentlyPlaying();
      const timestamp = new Date();
      const spotifyData = response.data as NowPlayingTrack;

      if (response.status >= 400) {
        console.warn(`Access token expired (status was ${response.status}), attempting to fetch new access token...`)
        await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
        await getNewAccessToken(currentRefreshToken);
        continue;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers['retry-after']) || 60;
        console.error(`Rate limit exceeded. Waiting for ${retryAfter} seconds.`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
	      continue; // Skip the rest of the loop and try the request again.
      }

      if (response.status != 204 && spotifyData?.item.id) {
        appRunning = true;

        const trackFeatures = getAudioFeatures(spotifyData.item.id);
        const artistInfo = getArtistInfo(spotifyData.item.artists[0].id);
        const albumInfo = getAlbumInfo(spotifyData.item.album.id);

        const result = durationMeasurer.checkTimer(
          spotifyData,
          { trackFeatures, artistInfo, albumInfo },
          timestamp
        );

        if (result) {
          // If there was a change
          writeToDb(
            result.track,
            result.additionalTrackInfo.trackFeatures,
            result.additionalTrackInfo.artistInfo,
            result.additionalTrackInfo.albumInfo,
            result.seconds,
            timestamp
          );
        }
      } else if (appRunning) {
        // Spotify app was closed
        console.debug("Spotify was closed");
        const result = durationMeasurer.quitApp(timestamp);
        if (result.seconds > 2) {
          writeToDb(
            result.track,
            result.additionalTrackInfo.trackFeatures,
            result.additionalTrackInfo.artistInfo,
            result.additionalTrackInfo.albumInfo,
            result.seconds,
            timestamp
          );
        }
        appRunning = false;
      }
    } catch (e) {
      console.error(e);
      running = false;
    }

    await new Promise((resolve) => setTimeout(resolve, appRunning ? 2000 : 5000));
  }

  // when access token is invalidated
  prepareToRecordData();
  return Promise.resolve();
}

async function getNewAccessToken(refreshToken: string): Promise<void> {
  currentRefreshToken = refreshToken;

  console.log("Refreshing token...");
  currentAccessToken = await requestRefreshedAccessToken(
    currentRefreshToken
  );
  running = true;
}

function prepareToRecordData(): void {
  fs.readFile(projectPath, async (err, data) => {
    if (!err) {
      try {
        const parsedJSON = JSON.parse(data.toString());
        await getNewAccessToken(parsedJSON.refresh_token);
        await recordData();
      } catch (e) {
        console.error(e);
        console.error("Error refreshing token. Try deleting spotifyKeys.json");
      }
    } else {
      console.error(err);
    }
  });
}

export { prepareToRecordData };
