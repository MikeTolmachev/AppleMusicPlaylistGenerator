export async function waitForMusicKit(timeoutMs = 7_500): Promise<MusicKitGlobal> {
  if (window.MusicKit) {
    return window.MusicKit;
  }

  return new Promise<MusicKitGlobal>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("MusicKit JS did not load. Check your network connection and Apple Music script access."));
    }, timeoutMs);

    const onLoad = () => {
      if (!window.MusicKit) {
        return;
      }

      cleanup();
      resolve(window.MusicKit);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      document.removeEventListener("musickitloaded", onLoad);
    };

    document.addEventListener("musickitloaded", onLoad);
  });
}

export async function authorizeAppleMusic(developerToken: string) {
  const MusicKit = await waitForMusicKit();
  await Promise.resolve(
    MusicKit.configure({
      developerToken,
      app: {
        name: "Apple Music Playlist Builder",
        build: "0.1.0"
      }
    })
  );

  const instance = MusicKit.getInstance();
  const musicUserToken = await instance.authorize();

  return {
    musicUserToken,
    storefront: instance.storefrontId ?? null
  };
}
