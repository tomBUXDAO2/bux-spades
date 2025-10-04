// EMERGENCY: Disable all logging in production for maximum performance
const isDev = process.env.NODE_ENV === 'development';

if (!isDev) {
  // Disable all console logging in production
  const noop = () => {};
  console.log = noop;
  console.error = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
}

export { isDev };
