import { useEffect, useState } from "react";
import { listProperties, updateProperty } from "../api.js";
import { ListingStatus, PriceUnit } from "../../../shared/contract.js";

const STATUS_LABELS = {
  available: "Available",
  under_offer: "Under Offer",
  sold: "Sold",
};

const UNIT_LABELS = {
  total: "KES (total)",
  per_month: "KES / month",
  per_sqft: "KES / sq ft",
  per_acre: "KES / acre",
};

// "5000000" (or 5000000) → "5,000,000" for the price field.
function formatPrice(value) {
  if (value === null || value === "") return "";
  return Number(value).toLocaleString("en-KE");
}

// One editable row. Dropdown changes save immediately; the price input saves
// on blur or Enter, so typing does not fire a request per keystroke.
function ListingRow({ property, onSaved, onError }) {
  const [priceDraft, setPriceDraft] = useState(formatPrice(property.priceKes));
  const [saving, setSaving] = useState(false);

  async function save(patch) {
    setSaving(true);
    try {
      onSaved(await updateProperty(property.id, patch));
      onError(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Keep only digits, then re-insert thousands separators live, so pasted
  // or typed commas are accepted (and never required).
  function handlePriceChange(e) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setPriceDraft(digits === "" ? "" : formatPrice(digits));
  }

  function savePrice() {
    const digits = priceDraft.replace(/[^\d]/g, "");
    const value = digits === "" ? null : Number(digits);
    if (value === property.priceKes) return;
    save({ priceKes: value });
  }

  return (
    <tr className={saving ? "row-saving" : ""}>
      <td>
        {property.name}
        {property.location && <span className="table-sub">{property.location}</span>}
      </td>
      <td>
        <select
          className="table-select"
          value={property.status}
          disabled={saving}
          onChange={(e) => save({ status: e.target.value })}
        >
          {ListingStatus.options.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          className="table-input"
          type="text"
          inputMode="numeric"
          placeholder="—"
          value={priceDraft}
          disabled={saving}
          onChange={handlePriceChange}
          onBlur={savePrice}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        />
      </td>
      <td>
        <select
          className="table-select"
          value={property.priceUnit}
          disabled={saving}
          onChange={(e) => save({ priceUnit: e.target.value })}
        >
          {PriceUnit.options.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
      </td>
      <td>{property.soldAt ?? "—"}</td>
      <td>
        {new Date(property.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
    </tr>
  );
}

export default function Listings() {
  const [properties, setProperties] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    listProperties()
      .then((body) => setProperties(body.properties))
      .catch((err) => setLoadError(err.message));
  }, []);

  if (loadError) {
    return <div className="error-banner">Could not load listings: {loadError}</div>;
  }
  if (!properties) {
    return <p className="loading">Loading listings…</p>;
  }

  return (
    <>
      {saveError && <div className="error-banner">Could not save: {saveError}</div>}
      <div className="card full-width">
        <h2>All Listings</h2>
        <p className="card-hint">
          Changes save as you make them. Marking a listing Sold stamps today as its sale date.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Status</th>
              <th>Price (KES)</th>
              <th>Unit</th>
              <th>Sold on</th>
              <th>Listed</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((property) => (
              <ListingRow
                key={property.id}
                property={property}
                onSaved={(updated) =>
                  setProperties((rows) => rows.map((r) => (r.id === updated.id ? updated : r)))
                }
                onError={setSaveError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
