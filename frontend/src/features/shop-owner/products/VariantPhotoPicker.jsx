
import { useEffect, useRef, useState } from "react";

export default function VariantPhotoPicker({
  file,
  onChange,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  function removePhoto() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    onChange(null);
  }

  return (
    <div className="create-variant-photo">
      <div className="create-variant-photo-heading">
        <strong>Variant Photo</strong>
        <span>Optional</span>
      </div>

      {file ? (
        <div className="create-variant-photo-preview">
          <img
            src={previewUrl}
            alt="Selected variant preview"
          />

          <div className="create-variant-photo-details">
            <strong>{file.name}</strong>
            <small>
              {(file.size / 1024).toFixed(1)} KB
            </small>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            disabled={disabled}
            onClick={removePhoto}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="create-variant-photo-empty">
          <span>No variant photo selected</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.files?.[0] || null);
        }}
      />

      <small className="muted-copy">
        JPEG, PNG or WebP. Maximum 5 MB.
      </small>
    </div>
  );
}
