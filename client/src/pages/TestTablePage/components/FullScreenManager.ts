import { isMobileOrTablet } from './DeviceDetection';

export const requestFullScreen = async (): Promise<void> => {
  if (isMobileOrTablet()) {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        await (document.documentElement as any).webkitRequestFullscreen();
      } else if ((document.documentElement as any).msRequestFullscreen) {
        await (document.documentElement as any).msRequestFullscreen();
      }
    } catch (error) {
      console.log('Full-screen request failed:', error);
    }
  }
};

export const exitFullScreen = async (): Promise<void> => {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen();
    } else if ((document as any).msExitFullscreen) {
      await (document as any).msExitFullscreen();
    }
  } catch (error) {
    console.log('Exit full-screen failed:', error);
  }
};
