import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * PlacesAutocomplete — Google Places autocomplete input.
 *
 * Expects the Google Maps JS API (with "places" library) to already be loaded
 * globally (done by BookingMap's useJsApiLoader).
 *
 * Props:
 *   value        – controlled text value
 *   onChange      – (text: string) => void  (fires on every keystroke)
 *   onPlaceSelect – ({ address, lat, lng }) => void  (fires when user picks a suggestion)
 *   placeholder   – input placeholder text
 *   disabled      – disable the input
 */
function PlacesAutocomplete({ value, onChange, onPlaceSelect, placeholder, disabled, userLocation }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [isReady, setIsReady] = useState(
    () => !!window.google?.maps?.places
  );

  // Poll for Google Maps Places API if not yet loaded
  useEffect(() => {
    if (isReady) return;
    const id = setInterval(() => {
      if (window.google?.maps?.places) {
        setIsReady(true);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [isReady]);

  // Attach Autocomplete once the API and DOM are ready
  useEffect(() => {
    if (!isReady || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry', 'name'],
      types: ['geocode', 'establishment'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;

      const address = place.formatted_address || place.name || '';
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      onChange(address);
      onPlaceSelect?.({ address, lat, lng });
    });

    autocompleteRef.current = ac;
  }, [isReady, onChange, onPlaceSelect]);

  // Set / update bounds to ~100 km radius from user location
  useEffect(() => {
    if (!autocompleteRef.current || !userLocation) return;
    const OFFSET = 0.9;
    const bounds = new window.google.maps.LatLngBounds(
      { lat: userLocation.lat - OFFSET, lng: userLocation.lng - OFFSET },
      { lat: userLocation.lat + OFFSET, lng: userLocation.lng + OFFSET },
    );
    autocompleteRef.current.setBounds(bounds);
    autocompleteRef.current.setOptions({ strictBounds: true });
  }, [userLocation]);

  const handleInput = useCallback(
    (e) => onChange(e.target.value),
    [onChange],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleInput}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
    />
  );
}

export default PlacesAutocomplete;
