type FbAuthResponse = {
  accessToken?: string;
  userID?: string;
};

type FbLoginResponse = {
  authResponse?: FbAuthResponse | null;
  status?: string;
};

type FbSdk = {
  init: (opts: Record<string, unknown>) => void;
  login: (cb: (response: FbLoginResponse) => void, opts?: { scope?: string }) => void;
};

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

let sdkLoading: Promise<FbSdk> | null = null;

export function loadFacebookSdk(appId: string): Promise<FbSdk> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  if (window.FB) {
    return Promise.resolve(window.FB);
  }
  if (sdkLoading) return sdkLoading;

  sdkLoading = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Facebook SDK load timeout'));
    }, 15000);

    window.fbAsyncInit = () => {
      try {
        window.FB!.init({
          appId,
          cookie: true,
          xfbml: false,
          version: 'v18.0'
        });
        window.clearTimeout(timeout);
        resolve(window.FB!);
      } catch (err) {
        window.clearTimeout(timeout);
        reject(err);
      }
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => {
      window.clearTimeout(timeout);
      sdkLoading = null;
      reject(new Error('Failed to load Facebook SDK'));
    };
    document.body.appendChild(script);
  });

  return sdkLoading;
}

/** Prompt Facebook login via JS SDK; returns a short-lived user access token. */
export function facebookSdkLogin(appId: string): Promise<string> {
  return loadFacebookSdk(appId).then(
    (FB) =>
      new Promise((resolve, reject) => {
        FB.login(
          (response) => {
            const token = response?.authResponse?.accessToken;
            if (token) resolve(token);
            else reject(new Error(response?.status === 'unknown' ? 'Facebook login cancelled' : 'Facebook login failed'));
          },
          { scope: 'public_profile' }
        );
      })
  );
}
