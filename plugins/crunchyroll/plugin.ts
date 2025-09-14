import type { CommentInsertResult } from '../../types/commentInsertResult';
import type { PluginAPI } from '../../types/pluginAPI';
import type { PluginClass } from '../../types/pluginClass';
import type { PluginManifest } from '../../types/pluginManifest';
import type { Status } from '../../types/status';

interface EpisodeData {
  title: string;
  episodeNumber: string;
  series: string;
  duration: number;
  currentTime: number;
}

interface IFrameVideoData {
  iFrameVideo: boolean;
  currTime: number;
  dur: number;
  paused: boolean;
}

// Iframe communication class similar to PreMiD
class IFrame {
  private targetWindow: Window | null = null;
  private targetOrigin: string = '*';

  constructor(targetWindow?: Window, targetOrigin?: string) {
    this.targetWindow = targetWindow || window.parent;
    this.targetOrigin = targetOrigin || '*';
  }

  send(data: { iFrameVideoData: IFrameVideoData }): void {
    if (this.targetWindow) {
      this.targetWindow.postMessage(data, this.targetOrigin);
    }
  }
}

export function createPlugin(manifest: PluginManifest): PluginClass {
  return new CrunchyrollPlugin(manifest);
}

class CrunchyrollPlugin implements PluginClass {
  private manifest: PluginManifest;
  private name: string;
  private api?: PluginAPI;
  private progressInterval?: NodeJS.Timeout;
  private iframeInterval?: NodeJS.Timeout;
  private lastProgressUpdate = 0;
  private episodeData: EpisodeData | null = null;
  private iFrameVideoData: IFrameVideoData | null = null;
  private iframe: IFrame;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;
    this.name = manifest.name;
    this.iframe = new IFrame();
  }

  onLoad(api: PluginAPI): void {
    console.log(`${this.name} loaded for Crunchyroll!`);
    this.api = api;

    // Setup iframe detection script if we're in an iframe
    if (window.self !== window.top) {
      this.setupIframeVideoDetection();
    }

    api.runtime.onMessage.addListener((message, _sender) => {
      if (message.type === 'crunchyroll_episode_data') {
        this.handleEpisodeData(message.data);
        return `Episode data received for ${message.data.title}`;
      }
    });

    // Listen for iframe video data responses
    window.addEventListener('message', event => {
      console.log('Received message from iframe:', event.origin, event.data);

      // Handle our custom iframe video data format
      if (event.data?.iFrameVideoData) {
        const newData = event.data.iFrameVideoData;
        if (newData.iFrameVideo && newData.dur > 0) {
          this.iFrameVideoData = newData;
          console.log('Updated iframe video data:', this.iFrameVideoData);

          // If we were still initializing, trigger another attempt
          if (this.initializeAttempts > 0) {
            setTimeout(() => {
              if (!this.episodeData) {
                this.initializeEpisodeTracking(window.location.href);
              }
            }, 100);
          }
        }
      }
    });
  }

  onUnload(): void {
    console.log(`${this.name} unloaded from Crunchyroll!`);
    this.cleanup();
  }

  onPageMatch(url: string): void | null {
    console.log(`${this.name} detected Crunchyroll episode page: ${url}`);

    setTimeout(() => {
      if (!this.isCrunchyrollWatchPage(url)) {
        console.log('Not a valid crunchyroll watch page with url ' + url);
        return null;
      }
      this.initializeEpisodeTracking(url);
    }, 2000);

    return null;
  }

  trackProgress(url: string): Status | null {
    console.log('Tracking progress for', url);
    if (!this.isCrunchyrollWatchPage(url)) {
      console.log('Not a valid crunchyroll watch page with url ' + url);
      return null;
    }

    const videoElement = this.findVideoElement();
    if (!videoElement) {
      console.log('No video element found');
      return null;
    }

    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;

    if (!duration || duration === 0) {
      console.log('No duration found');
      return null;
    }

    const progress = Math.min((currentTime / duration) * 100, 100);
    const episodeInfo = this.extractEpisodeInfo();

    const status: Status = {
      title: episodeInfo.title,
      progress: Number(episodeInfo.episodeNumber),
      finished: progress >= 90, // Consider 90% as finished
      currentTime: currentTime,
      duration: duration,
    };
    console.log('Status: ' + status);

    this.saveProgress(status);
    this.sendStatusUpdate(status);

    return status;
  }

  private initializeAttempts = 0;
  private maxInitializeAttempts = 60; // Try for 60 seconds

  private initializeEpisodeTracking(url: string): void {
    this.initializeAttempts++;
    console.log(
      `Initialize attempt ${this.initializeAttempts}/${this.maxInitializeAttempts}`
    );

    const videoElement = this.findVideoElement();

    if (videoElement) {
      console.log('Video element found, initializing tracking');
      this.episodeData = this.extractEpisodeInfo();
      this.setupVideoListeners();
      this.startProgressTracking();
      this.initializeAttempts = 0; // Reset counter
    } else if (this.initializeAttempts < this.maxInitializeAttempts) {
      // Try more frequently at first, then less frequently
      const delay = this.initializeAttempts < 10 ? 1000 : 2000;
      setTimeout(() => this.initializeEpisodeTracking(url), delay);
    } else {
      console.log('Max initialization attempts reached, giving up');
      this.initializeAttempts = 0;
    }
  }

  // Setup iframe video detection similar to PreMiD
  private setupIframeVideoDetection(): void {
    console.log('Setting up iframe video detection');

    this.iframeInterval = setInterval(() => {
      // Try multiple selectors like PreMiD does
      const video =
        document.querySelector<HTMLVideoElement>('#player0') ??
        document.querySelector<HTMLVideoElement>('#player_html5_api') ??
        document.querySelector<HTMLVideoElement>(
          'video[data-testid="vilos-player_html5_api"]'
        ) ??
        document.querySelector<HTMLVideoElement>('video');

      if (video && !Number.isNaN(video.duration) && video.duration > 0) {
        const videoData = {
          iFrameVideoData: {
            iFrameVideo: true,
            currTime: video.currentTime,
            dur: video.duration,
            paused: video.paused,
          },
        };

        // Send to parent window
        this.iframe.send(videoData);

        // Also update local data
        this.iFrameVideoData = videoData.iFrameVideoData;
      }
    }, 100); // Check every 100ms like PreMiD
  }

  private findVideoElement(): HTMLVideoElement | null {
    console.log('Searching for video element...');
    console.log('Current iframe video data:', this.iFrameVideoData);

    // First check if we have iframe video data
    if (
      this.iFrameVideoData &&
      this.iFrameVideoData.iFrameVideo &&
      !Number.isNaN(this.iFrameVideoData.dur) &&
      this.iFrameVideoData.dur > 0
    ) {
      console.log('Using iframe video data:', this.iFrameVideoData);
      return {
        currentTime: this.iFrameVideoData.currTime,
        duration: this.iFrameVideoData.dur,
        paused: this.iFrameVideoData.paused,
        readyState: 4, // HAVE_ENOUGH_DATA
        src: 'iframe-video',
        currentSrc: 'iframe-video',
        addEventListener: () => {}, // Dummy implementation
      } as unknown as HTMLVideoElement;
    }

    // Try to find video in main document first
    const selectors = [
      'video#player0',
      'video#player_html5_api',
      'video[data-testid="vilos-player_html5_api"]',
      'video.html5-main-video',
      'video',
      '.vilos-player video',
      '[data-testid="vilos-player"] video',
    ];

    console.log('Searching in main document with selectors:', selectors);
    for (const selector of selectors) {
      const video = document.querySelector(selector) as HTMLVideoElement;
      if (video && (video.duration > 0 || video.src || video.currentSrc)) {
        console.log(`Found video in main document with selector: ${selector}`);
        return video;
      }
    }

    // Try to find video in same-origin iframes
    this.searchIframesForVideo();

    // Setup iframe communication for cross-origin iframes
    this.setupCrossOriginIframeDetection();

    return null;
  }

  private searchIframesForVideo(): HTMLVideoElement | null {
    const iframes = document.querySelectorAll('iframe');
    console.log(`Found ${iframes.length} iframes in document`);

    for (let i = 0; i < iframes.length; i++) {
      try {
        const iframe = iframes[i];
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow?.document;

        if (iframeDoc) {
          console.log(`Can access iframe ${i} content`);
          const selectors = [
            'video#player0',
            'video#player_html5_api',
            'video[data-testid="vilos-player_html5_api"]',
            'video',
          ];

          for (const selector of selectors) {
            const video = iframeDoc.querySelector(selector) as HTMLVideoElement;
            if (
              video &&
              (video.duration > 0 || video.src || video.currentSrc)
            ) {
              console.log(
                `Found video in iframe ${i} with selector: ${selector}`
              );

              // Update iframe video data
              this.iFrameVideoData = {
                iFrameVideo: true,
                currTime: video.currentTime,
                dur: video.duration,
                paused: video.paused,
              };

              // Inject the detection script into this iframe
              this.injectVideoDetectionScript(iframe.contentWindow!);

              return video;
            }
          }
        }
      } catch {
        console.log(`Cannot access iframe ${i} content (cross-origin)`);
      }
    }

    return null;
  }

  private setupCrossOriginIframeDetection(): void {
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach(iframe => {
      // Inject script into cross-origin iframes that might contain the video
      if (
        iframe.src &&
        (iframe.src.includes('crunchyroll.com') ||
          iframe.src.includes('vilos-v2/web/vilos/player.html') ||
          iframe.src.includes('static.crunchyroll.com'))
      ) {
        console.log('Setting up detection for Crunchyroll iframe:', iframe.src);
        this.injectVideoDetectionIntoIframe(iframe);
      }
    });
  }

  private injectVideoDetectionIntoIframe(iframe: HTMLIFrameElement): void {
    // Listen for the iframe to load
    iframe.addEventListener('load', () => {
      try {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow) {
          this.injectVideoDetectionScript(iframeWindow);
        }
      } catch (error) {
        console.log('Could not inject script into iframe:', error);
        // For cross-origin iframes, we need to rely on postMessage
        this.setupPostMessageCommunication(iframe);
      }
    });

    // If iframe is already loaded
    if (iframe.contentWindow) {
      try {
        this.injectVideoDetectionScript(iframe.contentWindow);
      } catch (error) {
        this.setupPostMessageCommunication(iframe);
      }
    }
  }

  private injectVideoDetectionScript(iframeWindow: Window): void {
    const script = `
      (function() {
        console.log('Crunchyroll iframe video detection script injected');
        
        const iframe = {
          send: function(data) {
            window.parent.postMessage(data, '*');
          }
        };
        
        setInterval(() => {
          const video = document.querySelector('#player0') ?? 
                       document.querySelector('#player_html5_api') ??
                       document.querySelector('video[data-testid="vilos-player_html5_api"]') ??
                       document.querySelector('video');
                       
          if (video && !isNaN(video.duration) && video.duration > 0) {
            iframe.send({
              iFrameVideoData: {
                iFrameVideo: true,
                currTime: video.currentTime,
                dur: video.duration,
                paused: video.paused,
              }
            });
          }
        }, 100);
      })();
    `;

    try {
      const scriptElement = iframeWindow.document.createElement('script');
      scriptElement.textContent = script;
      iframeWindow.document.head.appendChild(scriptElement);
      console.log('Successfully injected video detection script');
    } catch (error) {
      console.log('Failed to inject script into iframe:', error);
    }
  }

  private setupPostMessageCommunication(iframe: HTMLIFrameElement): void {
    // Send periodic requests for video data
    const requestInterval = setInterval(() => {
      iframe.contentWindow?.postMessage(
        {
          type: 'REQUEST_VIDEO_DATA',
          source: 'crunchyroll-plugin',
        },
        '*'
      );
    }, 1000);

    // Clean up after 60 seconds
    setTimeout(() => clearInterval(requestInterval), 60000);
  }

  private extractEpisodeInfo(): EpisodeData {
    const titleElement =
      document.querySelector('h1[data-testid="episode-title"]') ||
      document.querySelector('h1.text--gq6o-') ||
      document.querySelector('.erc-series-title h1') ||
      document.querySelector('h1');

    const seriesElement =
      document.querySelector('[data-testid="series-title"]') ||
      document.querySelector('.series-title') ||
      document.querySelector('.text--is-l');

    const episodeNumberElement =
      document.querySelector('[data-testid="episode-num"]') ||
      document.querySelector('.episode-number');

    const title = titleElement?.textContent?.trim() || 'Unknown Episode';
    const series = seriesElement?.textContent?.trim() || 'Unknown Series';
    const episodeNumber =
      episodeNumberElement?.textContent?.trim() ||
      this.extractEpisodeFromTitle(title) ||
      this.extractEpisodeFromUrl(window.location.href);

    const videoElement = this.findVideoElement();

    return {
      title: title,
      episodeNumber: episodeNumber,
      series: series,
      duration: videoElement?.duration || 0,
      currentTime: videoElement?.currentTime || 0,
    };
  }

  private extractEpisodeFromTitle(title: string): string {
    const match = title.match(/(?:Episode|Ep|E)\s*(\d+)/i);
    return match?.[1] || '';
  }

  private extractEpisodeFromUrl(url: string): string {
    const match = url.match(/\/watch\/(\w+)/);
    return match?.[1] || '';
  }

  private setupVideoListeners(): void {
    const videoElement = this.findVideoElement();
    if (!videoElement) return;

    const updateProgress = () => {
      const now = Date.now();
      if (now - this.lastProgressUpdate > 5000) {
        // Update every 5 seconds
        this.trackProgress(window.location.href);
        this.lastProgressUpdate = now;
      }
    };

    videoElement.addEventListener('timeupdate', updateProgress);
    videoElement.addEventListener('ended', () => {
      const status = this.trackProgress(window.location.href);
      if (status) {
        status.finished = true;
        status.progress = 100;
        this.saveProgress(status);
      }
    });
  }

  private startProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }

    this.progressInterval = setInterval(() => {
      this.trackProgress(window.location.href);
    }, 10000); // Update every 10 seconds
  }

  getCommentPlacingQueries(url: string): CommentInsertResult {
    console.log('Try getting placing queries:');

    if (!this.isCrunchyrollWatchPage(url)) {
      return {
        loadingQueries: [],
        insertionQueries: [],
        classes: [],
        selectFromLast: false,
      };
    }

    return {
      loadingQueries: ['svg[data-t="loading-state-icon"]'],
      insertionQueries: [
        '[class^="content-wrapper-"]',
        '.body-wrapper',
        '.current-media-wrapper',
        'body',
      ],
      classes: [],
      selectFromLast: true,
    };
  }

  private async saveProgress(status: Status): Promise<void> {
    if (!this.api || !this.episodeData) return;

    const storageKey = `crunchyroll_progress_${this.episodeData.series}_${status.progress}`;
    const progressData = {
      title: status.title,
      series: this.episodeData.series,
      progress: status.progress,
      currentTime: status.currentTime,
      duration: status.duration,
      finished: status.finished,
      lastWatched: Date.now(),
      url: window.location.href,
    };

    try {
      await this.api.storage.set(storageKey, progressData);
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }

  private sendStatusUpdate(status: Status): void {
    if (this.api) {
      this.api.runtime.sendMessage({
        type: 'status_update',
        pluginId: this.manifest.id,
        status: status,
        url: window.location.href,
      });
    }
  }

  private isCrunchyrollWatchPage(url: string): boolean {
    return url.includes('crunchyroll.com') && url.includes('watch');
  }

  private handleEpisodeData(data: unknown): void {
    this.episodeData = data as EpisodeData;
    console.log('Received episode data:', data);
  }

  private cleanup(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = undefined;
    }

    if (this.iframeInterval) {
      clearInterval(this.iframeInterval);
      this.iframeInterval = undefined;
    }

    // Query for custom div and hide it instead of using stored reference
    const customDiv = (window as { extensionSharedProgressDiv?: HTMLElement })
      .extensionSharedProgressDiv;

    if (customDiv) {
      const innerDiv = customDiv.querySelector('div');
      if (innerDiv) {
        (innerDiv as HTMLElement).style.display = 'none';
      }
    }

    this.episodeData = null;
    this.iFrameVideoData = null;
  }
}
