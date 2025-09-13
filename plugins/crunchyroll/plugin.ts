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

export function createPlugin(manifest: PluginManifest): PluginClass {
  return new CrunchyrollPlugin(manifest);
}

class CrunchyrollPlugin implements PluginClass {
  private manifest: PluginManifest;
  private name: string;
  private api?: PluginAPI;
  private progressInterval?: NodeJS.Timeout;
  private lastProgressUpdate = 0;
  private episodeData: EpisodeData | null = null;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;
    this.name = manifest.name;
  }

  onLoad(api: PluginAPI): void {
    console.log(`${this.name} loaded for Crunchyroll!`);
    this.api = api;

    api.runtime.onMessage.addListener((message, _sender) => {
      if (message.type === 'crunchyroll_episode_data') {
        this.handleEpisodeData(message.data);
        return `Episode data received for ${message.data.title}`;
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
      this.initializeEpisodeTracking(url);
      this.insertProgressDiv();
    }, 2000);

    return null;
  }

  trackProgress(url: string): Status | null {
    console.log('Tracking progress for', url);
    if (!this.isCrunchyrollWatchPage(url)) {
      return null;
    }

    const videoElement = this.findVideoElement();
    if (!videoElement) {
      return null;
    }

    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;

    if (!duration || duration === 0) {
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

    this.updateProgressDiv(status);
    this.saveProgress(status);
    this.sendStatusUpdate(status);

    return status;
  }

  private initializeEpisodeTracking(url: string): void {
    const videoElement = this.findVideoElement();

    if (videoElement) {
      this.episodeData = this.extractEpisodeInfo();
      this.setupVideoListeners();
      this.startProgressTracking();
    } else {
      setTimeout(() => this.initializeEpisodeTracking(url), 1000);
    }
  }

  private findVideoElement(): HTMLVideoElement | null {
    const selectors = [
      'video[data-testid="vilos-player_html5_api"]',
      'video.html5-main-video',
      'video',
      '.vilos-player video',
      '[data-testid="vilos-player"] video',
    ];

    for (const selector of selectors) {
      const video = document.querySelector(selector) as HTMLVideoElement;
      if (video && video.duration > 0) {
        return video;
      }
    }

    return null;
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
        this.updateProgressDiv(status);
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

  private insertProgressDiv(): boolean {
    // Get the shared progress div from the extension
    const sharedDiv = (window as { extensionSharedProgressDiv?: HTMLElement })
      .extensionSharedProgressDiv;

    if (sharedDiv) {
      // Show the shared div and ensure it's visible
      const innerDiv = sharedDiv.querySelector('div');
      if (innerDiv) {
        (innerDiv as HTMLElement).style.display = 'block';
      }
      return true;
    }

    return false;
  }

  getCommentPlacingQueries(): CommentInsertResult {
    console.log('Try getting placing classes');

    return {
      loadingQueries: ['svg[data-t="loading-state-icon"]'],
      insertionQueries: ['.current-media-wrapper', '.body-wrapper', 'body'],
    };
  }

  private updateProgressDiv(status: Status): void {
    // Query for the custom div instead of using stored reference
    const customDiv = (window as { extensionSharedProgressDiv?: HTMLElement })
      .extensionSharedProgressDiv;

    if (!customDiv) return;

    const episodeInfoEl = customDiv.querySelector(
      '#episode-info'
    ) as HTMLElement;
    const progressBarEl = customDiv.querySelector(
      '#progress-bar'
    ) as HTMLElement;
    const progressPercentEl = customDiv.querySelector(
      '#progress-percent'
    ) as HTMLElement;
    const currentTimeEl = customDiv.querySelector(
      '#current-time'
    ) as HTMLElement;
    const totalTimeEl = customDiv.querySelector('#total-time') as HTMLElement;

    if (episodeInfoEl) {
      episodeInfoEl.textContent = `${status.title}${status.progress ? ` - Ep ${status.progress}` : ''}`;
    }

    if (progressBarEl) {
      progressBarEl.style.width = `${status.progress}%`;
      if (status.finished) {
        progressBarEl.style.background = '#4ade80'; // Green when finished
      }
    }

    if (progressPercentEl) {
      progressPercentEl.textContent = `${Math.round(status.progress)}%`;
    }

    if (currentTimeEl && status.currentTime !== undefined) {
      currentTimeEl.textContent = this.formatTime(status.currentTime);
    }

    if (totalTimeEl && status.duration !== undefined) {
      totalTimeEl.textContent = this.formatTime(status.duration);
    }
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
    return (
      url.includes('crunchyroll.com/watch/') ||
      url.includes('crunchyroll.com/watch-')
    );
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
  }
}
