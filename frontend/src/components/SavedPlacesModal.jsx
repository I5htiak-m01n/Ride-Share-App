import { useState, useEffect, useCallback } from 'react';
import { savedPlacesAPI } from '../api/client';
import PlacesAutocomplete from './PlacesAutocomplete';

/**
 * SavedPlacesModal — Uber-style modal for managing and selecting saved places.
 *
 * Props:
 *   isOpen       – boolean, whether modal is visible
 *   onClose      – () => void
 *   onSelect     – ({ label, address, lat, lng }) => void — called when user picks a place
 *   userLocation – { lat, lng } for PlacesAutocomplete bounds
 */
function SavedPlacesModal({ isOpen, onClose, onSelect, userLocation }) {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'add'
  const [error, setError] = useState(null);

  // Add form state
  const [newLabel, setNewLabel] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCoords, setNewCoords] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await savedPlacesAPI.getAll();
      setPlaces(data.places || []);
    } catch {
      setError('Failed to load saved places');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPlaces();
      setView('list');
      setError(null);
    }
  }, [isOpen, fetchPlaces]);

  const handleDelete = async (placeId, e) => {
    e.stopPropagation();
    try {
      await savedPlacesAPI.remove(placeId);
      setPlaces((prev) => prev.filter((p) => p.place_id !== placeId));
    } catch {
      setError('Failed to delete place');
    }
  };

  const handleSave = async () => {
    if (!newLabel.trim() || !newAddress.trim() || !newCoords) return;
    setSaving(true);
    setError(null);
    try {
      await savedPlacesAPI.create({
        label: newLabel.trim(),
        address: newAddress.trim(),
        lat: newCoords.lat,
        lng: newCoords.lng,
      });
      setNewLabel('');
      setNewAddress('');
      setNewCoords(null);
      setView('list');
      fetchPlaces();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save place');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (place) => {
    onSelect({
      label: place.label,
      address: place.address,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lng),
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="saved-places-modal-overlay" onClick={onClose}>
      <div className="saved-places-modal" onClick={(e) => e.stopPropagation()}>
        {view === 'list' ? (
          <>
            <div className="saved-places-header">
              <h3>Choose a place</h3>
              <button className="saved-places-close" onClick={onClose}>&times;</button>
            </div>

            <div
              className="saved-place-add-row"
              onClick={() => { setView('add'); setError(null); }}
            >
              <span className="saved-place-add-icon">+</span>
              <span>Add a new place</span>
            </div>

            {error && <div className="saved-places-error">{error}</div>}

            {loading ? (
              <div className="saved-places-loading">Loading...</div>
            ) : places.length === 0 ? (
              <div className="saved-places-empty">No saved places yet</div>
            ) : (
              <div className="saved-places-list">
                {places.map((place) => (
                  <div
                    key={place.place_id}
                    className="saved-place-row"
                    onClick={() => handleSelect(place)}
                  >
                    <div className="saved-place-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <div className="saved-place-info">
                      <div className="saved-place-label">{place.label}</div>
                      <div className="saved-place-address">{place.address}</div>
                    </div>
                    <button
                      className="saved-place-delete"
                      onClick={(e) => handleDelete(place.place_id, e)}
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="saved-places-header">
              <button
                className="saved-places-back"
                onClick={() => { setView('list'); setError(null); }}
              >
                &larr;
              </button>
              <h3>Add a place</h3>
              <button className="saved-places-close" onClick={onClose}>&times;</button>
            </div>

            {error && <div className="saved-places-error">{error}</div>}

            <div className="saved-place-form">
              <div className="saved-place-form-field">
                <label>Name</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Home, Work, Gym"
                  maxLength={50}
                />
              </div>
              <div className="saved-place-form-field">
                <label>Address</label>
                <PlacesAutocomplete
                  value={newAddress}
                  onChange={setNewAddress}
                  onPlaceSelect={({ address, lat, lng }) => {
                    setNewAddress(address);
                    setNewCoords({ lat, lng });
                  }}
                  placeholder="Search for an address"
                  userLocation={userLocation}
                />
              </div>
              <button
                className="saved-place-save-btn"
                onClick={handleSave}
                disabled={saving || !newLabel.trim() || !newCoords}
              >
                {saving ? 'Saving...' : 'Save Place'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SavedPlacesModal;
