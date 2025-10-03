export const isMobileOrTablet = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 1024;
};

export const isBot = (p: any): p is any => p && p.type === 'bot';
