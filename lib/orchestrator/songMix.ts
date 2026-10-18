/** A music video with its song: the song is the whole soundtrack, the clips' own audio is dropped (ffmpeg-assembly). */
export function keepsOnlySong(o: { musicVideo: boolean; hasMusic: boolean }): boolean {
  return o.musicVideo && o.hasMusic;
}
