interface AdditionalTrackInfo {
  trackFeatures: () => Promise<TrackFeatures>;
  artistInfo: () => Promise<ArtistInfo>;
  albumInfo: () => Promise<AlbumInfo>;
}

interface MeasurerResult {
  seconds: number;
  track: NowPlayingTrack;
  additionalTrackInfo: AdditionalTrackInfo;
}

class Measurer {
  currentlyTrackingTrack: NowPlayingTrack | null;
  currentlyTrackingAdditionalTrackInfo: AdditionalTrackInfo | null;
  startDate: Date;
  playing: boolean;

  constructor() {
    this.currentlyTrackingTrack = null;
    this.currentlyTrackingAdditionalTrackInfo = null;
    this.startDate = new Date();
    this.playing = false;
  }

  checkTimer(
    currentlyTrackingTrack: NowPlayingTrack,
    additionalTrackInfo: AdditionalTrackInfo,
    currentTimestamp: Date
  ): MeasurerResult | null {
    // If there isn't a currently playing track then
    if (!this.currentlyTrackingTrack || !this.playing) {
      this.startDate = new Date();
      this.currentlyTrackingTrack = currentlyTrackingTrack;
      this.currentlyTrackingAdditionalTrackInfo = additionalTrackInfo;
      this.playing = currentlyTrackingTrack.is_playing;
    }

    const trackedTrack = this.currentlyTrackingTrack;
    const trackedTrackAdditionalInfo = this.currentlyTrackingAdditionalTrackInfo;
    const trackIdHasChanged = this.currentlyTrackingTrack?.item.id != currentlyTrackingTrack.item.id;
    const isNotFirstTrackInSession = this.currentlyTrackingTrack != null;
    const trackNoLongerPlaying = !currentlyTrackingTrack.is_playing && this.playing;
    if ((trackIdHasChanged && isNotFirstTrackInSession) || (trackNoLongerPlaying)) {
      const duration = Math.round(
        (currentTimestamp.getTime() - this.startDate.getTime()) / 1000
      );

      this.currentlyTrackingTrack = currentlyTrackingTrack;
      this.currentlyTrackingAdditionalTrackInfo = additionalTrackInfo;
      this.startDate = new Date();
      this.playing = currentlyTrackingTrack.is_playing;

      if (duration > 5) {
        return {
          seconds: duration,
          track: trackedTrack as NowPlayingTrack,
          additionalTrackInfo: trackedTrackAdditionalInfo as AdditionalTrackInfo,
        };
      }
    } 

    return null;
  }

  quitApp(currentTimestamp: Date): MeasurerResult {
    const tempCurrentlyPlayingTrack = this.currentlyTrackingTrack;
    const tempCurrentlyPlayingTrackAdditionalInfo =
      this.currentlyTrackingAdditionalTrackInfo;
    const duration = Math.round(
      (currentTimestamp.getTime() - this.startDate.getTime()) / 1000
    );
    this.currentlyTrackingTrack = null;
    this.currentlyTrackingAdditionalTrackInfo = null;
    return {
      seconds: duration,
      track: tempCurrentlyPlayingTrack as NowPlayingTrack,
      additionalTrackInfo:
        tempCurrentlyPlayingTrackAdditionalInfo as AdditionalTrackInfo,
    };
  }
}

export { Measurer };
