export interface PluginAPI {
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  tabs: {
    getCurrent: () => Promise<chrome.tabs.Tab | undefined>;
    query: (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
    sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  };
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: chrome.runtime.MessageSender
        ) => void
      ) => void;
    };
  };
}
