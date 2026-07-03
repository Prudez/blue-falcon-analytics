import { useEffect, useState } from "react";
import {
  listProperties,
  createProperty,
  updateProperty,
  listPlatformLinks,
  addPlatformLink,
  deletePlatformLink,
} from "../api.js";
import { ListingStatus, PriceUnit } from "../../../shared/contract.js";
import { KNOWN_PLATFORM_LABELS, platformLabel } from "../platforms.js";

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

// "5000000" (or 5000000) → "5,000,000" for the price fields.
function formatPrice(value) {
  if (value === null || value === "") return "";
  return Number(value).toLocaleString("en-KE");
}

function priceDigits(draft) {
  return draft.replace(/[^\d]/g, "");
}

// New-listing form. Only the name is required; everything else can be set
// later from the table.
function AddListingForm({ onAdded, onError }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("total");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      onError("The new listing needs a name.");
      return;
    }
    setSaving(true);
    try {
      const digits = priceDigits(price);
      const created = await createProperty({
        name: name.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        priceKes: digits === "" ? null : Number(digits),
        priceUnit: unit,
      });
      onAdded(created);
      onError(null);
      setName("");
      setLocation("");
      setPrice("");
      setUnit("total");
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-listing-form" onSubmit={submit}>
      <input
        className="table-input form-grow"
        type="text"
        placeholder="Property name"
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="table-input form-grow"
        type="text"
        placeholder="Location"
        value={location}
        disabled={saving}
        onChange={(e) => setLocation(e.target.value)}
      />
      <input
        className="table-input"
        type="text"
        inputMode="numeric"
        placeholder="Price (KES)"
        value={price}
        disabled={saving}
        onChange={(e) => setPrice(formatPrice(priceDigits(e.target.value)))}
      />
      <select
        className="table-select"
        value={unit}
        disabled={saving}
        onChange={(e) => setUnit(e.target.value)}
      >
        {PriceUnit.options.map((u) => (
          <option key={u} value={u}>
            {UNIT_LABELS[u]}
          </option>
        ))}
      </select>
      <button className="button-primary" type="submit" disabled={saving}>
        Add listing
      </button>
    </form>
  );
}

// A text field that saves on blur/Enter and reverts on failure or when
// emptied (for fields that must not be blank).
function InlineText({ value, placeholder, required, onSave, disabled, className }) {
  const [draft, setDraft] = useState(value ?? "");

  function commit() {
    const next = draft.trim();
    if ((value ?? "") === next) return;
    if (required && next === "") {
      setDraft(value ?? "");
      return;
    }
    onSave(next === "" ? null : next);
  }

  return (
    <input
      className={className ?? "table-input"}
      type="text"
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
    />
  );
}

// The social-posts editor shown when a listing row is expanded. Adds and
// removes property→post links; the platform can be one of the built-in
// four or any custom name.
function LinksEditor({ property, links, onChanged, onError }) {
  const CUSTOM = "__custom__";
  const [platform, setPlatform] = useState("facebook");
  const [customSlug, setCustomSlug] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    const slug =
      platform === CUSTOM ? customSlug.trim().toLowerCase().replace(/\s+/g, "_") : platform;
    setBusy(true);
    try {
      await addPlatformLink({ propertyId: property.id, platform: slug, postUrl: url.trim() });
      onChanged();
      onError(null);
      setUrl("");
      setCustomSlug("");
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    try {
      await deletePlatformLink(id);
      onChanged();
      onError(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="links-editor">
      {links.length === 0 ? (
        <p className="loading">No social posts linked to {property.name} yet.</p>
      ) : (
        <ul className="links-list">
          {links.map((link) => (
            <li key={link.id}>
              <span className="link-platform">{platformLabel(link.platform)}</span>
              <a href={link.postUrl} target="_blank" rel="noreferrer">
                {link.postUrl}
              </a>
              <button
                className="button-remove"
                type="button"
                disabled={busy}
                onClick={() => remove(link.id)}
                title="Remove this link"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="add-link-form" onSubmit={add}>
        <select
          className="table-select"
          value={platform}
          disabled={busy}
          onChange={(e) => setPlatform(e.target.value)}
        >
          {Object.entries(KNOWN_PLATFORM_LABELS).map(([slug, label]) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
          <option value={CUSTOM}>Other platform…</option>
        </select>
        {platform === CUSTOM && (
          <input
            className="table-input"
            type="text"
            placeholder="Platform name"
            value={customSlug}
            disabled={busy}
            onChange={(e) => setCustomSlug(e.target.value)}
          />
        )}
        <input
          className="table-input form-grow"
          type="url"
          placeholder="https://… link to the post"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className="button-primary" type="submit" disabled={busy || !url.trim()}>
          Link post
        </button>
      </form>
    </div>
  );
}

// One editable row. Dropdown changes save immediately; text fields save on
// blur or Enter, so typing does not fire a request per keystroke.
function ListingRow({ property, links, expanded, onToggle, onSaved, onLinksChanged, onError }) {
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

  function savePrice() {
    const digits = priceDigits(priceDraft);
    const value = digits === "" ? null : Number(digits);
    if (value === property.priceKes) return;
    save({ priceKes: value });
  }

  return (
    <>
      <tr className={saving ? "row-saving" : ""}>
        <td>
          <InlineText
            className="table-input cell-name"
            value={property.name}
            placeholder="Name"
            required
            disabled={saving}
            onSave={(name) => save({ name })}
          />
          <InlineText
            className="table-input cell-location"
            value={property.location}
            placeholder="Location"
            disabled={saving}
            onSave={(location) => save({ location })}
          />
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
            onChange={(e) => setPriceDraft(formatPrice(priceDigits(e.target.value)))}
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
        <td>
          <button className="button-link" type="button" onClick={onToggle}>
            {links.length} post{links.length === 1 ? "" : "s"} {expanded ? "▴" : "▾"}
          </button>
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
      {expanded && (
        <tr className="links-row">
          <td colSpan={7}>
            <LinksEditor
              property={property}
              links={links}
              onChanged={onLinksChanged}
              onError={onError}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default function Listings() {
  const [properties, setProperties] = useState(null);
  const [links, setLinks] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  function refreshLinks() {
    return listPlatformLinks()
      .then((body) => setLinks(body.links))
      .catch((err) => setSaveError(err.message));
  }

  useEffect(() => {
    Promise.all([listProperties(), listPlatformLinks()])
      .then(([props, linkBody]) => {
        setProperties(props.properties);
        setLinks(linkBody.links);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  if (loadError) {
    return <div className="error-banner">Could not load listings: {loadError}</div>;
  }
  if (!properties || !links) {
    return <p className="loading">Loading listings…</p>;
  }

  return (
    <>
      {saveError && <div className="error-banner">Could not save: {saveError}</div>}
      <div className="card full-width">
        <h2>All Listings</h2>
        <p className="card-hint">
          Changes save as you make them. Marking a listing Sold stamps today as its sale date.
          "Posts" ties a listing to its social media posts, ready for marketing analytics.
        </p>
        <AddListingForm
          onAdded={(created) => setProperties((rows) => [created, ...rows])}
          onError={setSaveError}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Status</th>
              <th>Price (KES)</th>
              <th>Unit</th>
              <th>Social</th>
              <th>Sold on</th>
              <th>Listed</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((property) => (
              <ListingRow
                key={property.id}
                property={property}
                links={links.filter((l) => l.propertyId === property.id)}
                expanded={expandedId === property.id}
                onToggle={() =>
                  setExpandedId((id) => (id === property.id ? null : property.id))
                }
                onSaved={(updated) =>
                  setProperties((rows) => rows.map((r) => (r.id === updated.id ? updated : r)))
                }
                onLinksChanged={refreshLinks}
                onError={setSaveError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
