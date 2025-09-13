// This script runs inside the Crunchyroll video player iframe
// Based on the PreMiD iframe pattern

console.log('Crunchyroll iframe handler loaded');

const iframe = {
  send: data => {
    window.parent.postMessage(data, '*');
  },
};

setInterval(() => {
  const video =
    document.querySelector('#player0') ??
    document.querySelector('#player_html5_api') ??
    document.querySelector('video');

  if (video && !Number.isNaN(video.duration)) {
    iframe.send({
      iFrameVideoData: {
        iFrameVideo: true,
        currTime: video.currentTime,
        dur: video.duration,
        paused: video.paused,
      },
    });
  }
}, 100);
