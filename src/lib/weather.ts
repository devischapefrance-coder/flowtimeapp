const CACHE_KEY = "flowtime_weather_cache";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
}

interface CachedWeather {
  data: WeatherData;
  timestamp: number;
}

const WEATHER_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: "Ciel degage", icon: "☀️" },
  1: { description: "Peu nuageux", icon: "🌤️" },
  2: { description: "Partiellement nuageux", icon: "⛅" },
  3: { description: "Couvert", icon: "☁️" },
  45: { description: "Brouillard", icon: "🌫️" },
  48: { description: "Brouillard givrant", icon: "🌫️" },
  51: { description: "Bruine legere", icon: "🌦️" },
  53: { description: "Bruine", icon: "🌦️" },
  55: { description: "Bruine dense", icon: "🌦️" },
  61: { description: "Pluie legere", icon: "🌧️" },
  63: { description: "Pluie", icon: "🌧️" },
  65: { description: "Pluie forte", icon: "🌧️" },
  66: { description: "Pluie verglacante", icon: "🌧️" },
  67: { description: "Pluie verglacante forte", icon: "🌧️" },
  71: { description: "Neige legere", icon: "🌨️" },
  73: { description: "Neige", icon: "🌨️" },
  75: { description: "Neige forte", icon: "❄️" },
  77: { description: "Grains de neige", icon: "❄️" },
  80: { description: "Averses legeres", icon: "🌦️" },
  81: { description: "Averses", icon: "🌧️" },
  82: { description: "Averses violentes", icon: "⛈️" },
  85: { description: "Averses de neige", icon: "🌨️" },
  86: { description: "Averses de neige fortes", icon: "❄️" },
  95: { description: "Orage", icon: "⛈️" },
  96: { description: "Orage avec grele", icon: "⛈️" },
  99: { description: "Orage violent avec grele", icon: "⛈️" },
};

function getCached(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedWeather = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_DURATION) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function setCache(data: WeatherData) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
  const cached = getCached();
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode&timezone=auto`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const code = json.current?.weathercode ?? 0;
    const info = WEATHER_CODES[code] || { description: "Inconnu", icon: "🌡️" };
    const data: WeatherData = {
      temperature: Math.round(json.current?.temperature_2m ?? 0),
      weatherCode: code,
      description: info.description,
      icon: info.icon,
    };
    setCache(data);
    return data;
  } catch {
    return null;
  }
}

export async function getWeatherWithGeolocation(
  profileLat?: number | null,
  profileLng?: number | null
): Promise<WeatherData | null> {
  // Try cached first
  const cached = getCached();
  if (cached) return cached;

  // Use profile coords if available
  if (profileLat && profileLng) {
    return fetchWeather(profileLat, profileLng);
  }

  // Fallback to browser geolocation
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(fetchWeather(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}
