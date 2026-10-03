export interface DeviceInfo {
  device: string;
  os: string;
  browser: string;
  full: string;
  isMobile: boolean;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined' || !navigator) {
    return {
      device: 'Perangkat Web',
      os: 'Unknown',
      browser: 'Web',
      full: '🌐 Web Browser',
      isMobile: false,
    };
  }

  const ua = navigator.userAgent || '';
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';

  let os = 'Unknown OS';
  let device = 'Desktop PC';
  let isMobile = false;

  // OS & Device detection
  if (/iPad|Macintosh/i.test(ua) && 'ontouchend' in document) {
    os = 'iPadOS';
    device = 'iPad Tablet';
    isMobile = true;
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS';
    device = 'iPhone';
    isMobile = true;
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    isMobile = true;
    if (/Mobile/i.test(ua)) {
      device = 'HP Android';
    } else {
      device = 'Tablet Android';
    }
  } else if (/Windows/i.test(ua) || /Win/i.test(platform)) {
    os = 'Windows';
    device = 'PC Windows';
    isMobile = false;
  } else if (/Mac/i.test(ua) || /Mac/i.test(platform)) {
    os = 'macOS';
    device = 'Mac / MacBook';
    isMobile = false;
  } else if (/Linux/i.test(ua) || /Linux/i.test(platform)) {
    os = 'Linux';
    device = 'Linux PC';
    isMobile = false;
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
    device = 'Chromebook';
    isMobile = false;
  }

  // Browser detection
  let browser = 'Browser';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/OPR|Opera/i.test(ua)) {
    browser = 'Opera';
  }

  const icon = isMobile ? (device.includes('Tablet') || device.includes('iPad') ? '📱' : '📱') : '💻';
  const full = `${icon} ${device} • ${browser}`;

  return {
    device,
    os,
    browser,
    full,
    isMobile,
  };
}
