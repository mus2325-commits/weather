// WMO 날씨 코드 -> 한국어 상태 텍스트 및 Iconify(meteocons) 아이콘 매핑
function getWeatherInfo(code, isDay = 1) {
  if (code === 0) {
    return {
      status: '맑음',
      icon: isDay ? 'meteocons:clear-day-fill' : 'meteocons:clear-night-fill'
    };
  }
  if (code === 1 || code === 2) {
    return {
      status: '구름 조금',
      icon: isDay ? 'meteocons:partly-cloudy-day-fill' : 'meteocons:partly-cloudy-night-fill'
    };
  }
  if (code === 3) {
    return {
      status: '흐림',
      icon: 'meteocons:overcast-fill'
    };
  }
  if (code === 45 || code === 48) {
    return {
      status: '안개',
      icon: 'meteocons:fog-fill'
    };
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return {
      status: '이슬비',
      icon: 'meteocons:drizzle-fill'
    };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return {
      status: '비',
      icon: 'meteocons:rain-fill'
    };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return {
      status: '눈',
      icon: 'meteocons:snow-fill'
    };
  }
  if ([95, 96, 99].includes(code)) {
    return {
      status: '뇌우',
      icon: 'meteocons:thunderstorms-rain-fill'
    };
  }

  return {
    status: '구름 조금',
    icon: 'meteocons:partly-cloudy-day-fill'
  };
}

// 역지오코딩으로 위도/경도 -> 지역명(시/도) 조회
async function fetchLocationName(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ko`
    );
    const data = await res.json();
    const addr = data.address || {};
    return addr.city || addr.province || addr.state || addr.county || '현재 위치';
  } catch (error) {
    console.error('지역명 조회 실패:', error);
    return '서울특별시';
  }
}

// Open-Meteo 실시간 날씨 및 파고 데이터 조회
async function fetchWeatherData(lat, lon) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,snow_depth,visibility,uv_index` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height&timezone=auto`;

  const [weatherRes, marineRes] = await Promise.all([
    fetch(weatherUrl),
    fetch(marineUrl).catch(() => null)
  ]);

  const weatherData = await weatherRes.json();
  const marineData = marineRes && marineRes.ok ? await marineRes.json() : null;

  return { weatherData, marineData };
}

// 화면 UI 업데이트
function updateWeatherUI(locationName, weatherData, marineData) {
  const current = weatherData.current;
  const daily = weatherData.daily;

  const { status, icon } = getWeatherInfo(current.weather_code, current.is_day);

  // 상단 지역명
  const locationEl = document.querySelector('.location-title');
  if (locationEl) locationEl.textContent = locationName;

  // 메인 날씨 아이콘 (Iconify)
  const mainIconEl = document.getElementById('main-weather-icon');
  if (mainIconEl) mainIconEl.setAttribute('icon', icon);

  // 메인 기온 및 상태
  document.getElementById('current-temp').textContent = `${Math.round(current.temperature_2m)}°`;
  document.getElementById('weather-status').textContent = status;

  const maxTemp = Math.round(daily.temperature_2m_max[0]);
  const minTemp = Math.round(daily.temperature_2m_min[0]);
  document.getElementById('temp-range').innerHTML =
    `최고 ${maxTemp}° <span class="range-bar">|</span> 최저 ${minTemp}°`;

  // 상세 지표 8종
  document.getElementById('humidity-val').textContent = `${current.relative_humidity_2m}%`;
  document.getElementById('rain-val').textContent = `${current.precipitation.toFixed(1)} mm`;
  document.getElementById('wind-val').textContent = `${current.wind_speed_10m.toFixed(1)} m/s`;
  document.getElementById('pressure-val').textContent = `${Math.round(current.surface_pressure)} hPa`;

  // snow_depth(m) -> cm 변환
  const snowCm = ((current.snow_depth || 0) * 100).toFixed(1);
  document.getElementById('snow-val').textContent = `${snowCm} cm`;

  // visibility(m) -> km 변환
  const visibilityKm = ((current.visibility || 10000) / 1000).toFixed(0);
  document.getElementById('visibility-val').textContent = `${visibilityKm} km`;

  // UV 지수
  document.getElementById('uv-val').textContent = Math.round(current.uv_index ?? 0);

  // 파도 높이 (내륙 좌표라 데이터가 없을 경우 0.0 m 표시)
  const waveHeight = marineData?.current?.wave_height;
  document.getElementById('wave-val').textContent =
    waveHeight !== null && waveHeight !== undefined ? `${waveHeight.toFixed(1)} m` : '0.0 m';
}

// 전체 실행 함수
async function loadWeather() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '불러오는 중...';
  }

  // 기본 좌표 (서울특별시)
  let lat = 37.5665;
  let lon = 126.9780;

  try {
    if ('geolocation' in navigator) {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000
        });
      });
      lat = position.coords.latitude;
      lon = position.coords.longitude;
    }
  } catch (geoError) {
    console.warn('GPS 위치 권한 거부 또는 시간 초과, 기본 좌표(서울)로 조회합니다.');
  }

  try {
    const [locationName, { weatherData, marineData }] = await Promise.all([
      fetchLocationName(lat, lon),
      fetchWeatherData(lat, lon)
    ]);

    updateWeatherUI(locationName, weatherData, marineData);
  } catch (error) {
    console.error('날씨 데이터 로드 실패:', error);
    alert('날씨 정보를 불러오는 데 실패했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '새로고침';
    }
  }
}

// 초기 로드 및 새로고침 버튼 이벤트 연결
document.addEventListener('DOMContentLoaded', () => {
  loadWeather();

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadWeather);
  }
});