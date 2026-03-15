declare global {
  interface MusicKitInstance {
    authorize(): Promise<string>;
    storefrontId?: string;
    musicUserToken?: string;
  }

  interface MusicKitGlobal {
    configure(configuration: {
      developerToken: string;
      app: {
        name: string;
        build: string;
      };
    }): void | Promise<void>;
    getInstance(): MusicKitInstance;
  }

  interface Window {
    MusicKit?: MusicKitGlobal;
  }

  interface DocumentEventMap {
    musickitloaded: Event;
  }
}

export {};
