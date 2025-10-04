// EMERGENCY: Disable all logging in production for maximum performance
const isDev = process.env.NODE_ENV === 'development';

if (!isDev) {
  // Disable all console logging in production
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
}

export { isDev };
