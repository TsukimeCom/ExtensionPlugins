export interface PluginAPI {
  storage: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  tabs: {
    getCurrent: () => Promise<chrome.tabs.Tab | undefined>;
    query: (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
    sendMessage: (tabId: number, message: any) => Promise<any>;
  };
  runtime: {
    sendMessage: (message: any) => Promise<any>;
    onMessage: {
      addListener: (
        callback: (message: any, sender: chrome.runtime.MessageSender) => void
      ) => void;
    };
  };
}
