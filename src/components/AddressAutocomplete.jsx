import { useEffect, useRef } from 'react';
import { config } from '../config.js';

const API_KEY = config.ids.googleMaps;
const SCRIPT_ID = 'google-maps-places-api';

// Load the Maps JS API once and resolve a promise when ready
let mapsReady = null;
function loadMapsApi() {
  if (mapsReady) return mapsReady;
  if (window.google?.maps?.places) {
    mapsReady = Promise.resolve();
    return mapsReady;
  }
  mapsReady = new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      // Script tag exists but not loaded yet — wait for it
      const existing = document.getElementById(SCRIPT_ID);
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });
  return mapsReady;
}

/**
 * Extract structured address components from a Places result.
 * Returns { streetAddress, city, state, postalCode, country, lat, lng, formattedAddress }
 */
export function parsePlaceComponents(place) {
  const get = (type, form = 'long_name') =>
    place.address_components?.find(c => c.types.includes(type))?.[form] ?? '';

  const streetNumber = get('street_number');
  const route = get('route');
  const streetAddress = [streetNumber, route].filter(Boolean).join(' ');

  return {
    streetAddress,
    city: get('locality') || get('sublocality_level_1') || get('administrative_area_level_3'),
    state: get('administrative_area_level_1', 'short_name'),
    postalCode: get('postal_code'),
    country: get('country', 'short_name'),
    lat: place.geometry?.location?.lat(),
    lng: place.geometry?.location?.lng(),
    formattedAddress: place.formatted_address || '',
  };
}

/**
 * Address autocomplete input backed by Google Places.
 *
 * Props:
 *   value        — controlled string value
 *   onChange     — called with the new string as the user types
 *   onPlace      — called with { streetAddress, city, state, postalCode, lat, lng, formattedAddress }
 *                  when the user selects a suggestion
 *   className    — CSS classes for the <input>
 *   placeholder  — input placeholder
 *   types        — Places API types array, default ['establishment', 'geocode']
 */
const HAS_KEY = API_KEY && API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY';

export default function AddressAutocomplete({
  value,
  onChange,
  onPlace,
  className = '',
  placeholder = 'Start typing an address…',
  types = ['establishment', 'geocode'],
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!HAS_KEY || !inputRef.current || autocompleteRef.current) return;
    loadMapsApi()
      .then(() => {
        if (!inputRef.current || autocompleteRef.current) return;
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          types,
          fields: ['address_components', 'formatted_address', 'geometry', 'name'],
        });
        autocompleteRef.current = ac;
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place.address_components) return;
          const parsed = parsePlaceComponents(place);
          const displayValue = place.name && !place.name.match(/^\d/)
            ? place.name
            : parsed.formattedAddress;
          onChange?.(displayValue);
          onPlace?.({ ...parsed, placeName: place.name });
        });
      })
      .catch(() => {});

    return () => { autocompleteRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className={className}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
