// This script runs inside the Crunchyroll video player iframe
// It listens for requests from the main page and responds with video data

console.log('Crunchyroll iframe handler loaded');

function findVideoElement() {
  const selectors = [
    'video#player0',
    'video[data-testid="vilos-player_html5_api"]',
    'video.html5-main-video',
    'video'
  ];

  for (const selector of selectors) {
    const video = document.querySelector(selector);
    if (video) {
      return video;
    }
  }
  return null;
}

function getVideoData() {
  const video = findVideoElement();
  if (!video) {
    return null;
  }

  return {
    currentTime: video.currentTime,
    duration: video.duration,
    readyState: video.readyState,
    src: video.src,
    currentSrc: video.currentSrc,
    paused: video.paused,
    id: video.id,
    className: video.className
  };
}

// Listen for requests from parent window
window.addEventListener('message', (event) => {
  if (event.data?.type === 'REQUEST_VIDEO_DATA' && event.data?.source === 'crunchyroll-plugin') {
    console.log('Received video data request from parent');

    const videoData = getVideoData();
    console.log('Sending video data:', videoData);

    // Send response back to parent window
    event.source.postMessage({
      type: 'VIDEO_DATA_RESPONSE',
      source: 'vilos-player',
      videoData: videoData
    }, '*');
  }
});

// Auto-send video data when video element becomes available
function checkForVideo() {
  const video = findVideoElement();
  if (video && video.duration > 0) {
    console.log('Video element ready, sending data to parent');
    parent.postMessage({
      type: 'VIDEO_DATA_RESPONSE',
      source: 'vilos-player',
      videoData: getVideoData()
    }, '*');
  }
}

// Check periodically for video element
setInterval(checkForVideo, 2000);

// Also check when page loads
document.addEventListener('DOMContentLoaded', checkForVideo);
if (document.readyState === 'complete') {
  checkForVideo();
}