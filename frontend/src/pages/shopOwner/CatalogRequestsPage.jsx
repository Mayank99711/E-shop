import { useState, useEffect, useRef, useMemo } from "react";
import Modal from "../../components/common/Modal.jsx";
import { resolveMediaUrl } from "../../services/apiClient.js";
import {
  submitBrandRequest,
  submitCategoryRequest,
  submitVariantRequest,
  uploadMasterDataImage,
} from "../../services/shopOwner/catalogRequests.js";

function useImagePreview(file) {
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

  return previewUrl;
}

export function CatalogRequestPage({
  section,
  requests,
  options,
  busy,
  submit,
  reload,
  loading = false,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const [categoryIcon, setCategoryIcon] = useState(null);
  const [categoryImage, setCategoryImage] = useState(null);
  const [brandLogo, setBrandLogo] = useState(null);

  const categoryIconInputRef = useRef(null);
  const categoryImageInputRef = useRef(null);
  const brandLogoInputRef = useRef(null);

  const categoryIconPreview = useImagePreview(categoryIcon);
  const categoryImagePreview = useImagePreview(categoryImage);
  const brandLogoPreview = useImagePreview(brandLogo);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [justification, setJustification] = useState("");
  const [supportingInfo, setSupportingInfo] = useState("");
  const [website, setWebsite] = useState("");
  const [attributeId, setAttributeId] = useState("");
  const [value, setValue] = useState("");
  const [variantRequestType, setVariantRequestType] =
    useState("VARIANT_ATTRIBUTE");

  // Shared search and filters for category, subcategory, brand and variant requests.
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [parentFilter, setParentFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("NEWEST");
  const [requestPage, setRequestPage] = useState(1);
  const requestsPerPage = 10;

  const details = {
    ...(description.trim()
      ? { description: description.trim() }
      : {}),
    ...(justification.trim()
      ? { justification: justification.trim() }
      : {}),
    ...(supportingInfo.trim()
      ? { supportingInfo: supportingInfo.trim() }
      : {}),
  };

  const isSubcategory = section === "subcategories";
  const isCategory =
    section === "categories" || isSubcategory;
  const isBrand = section === "brands";
  const isVariant = section === "attributes";

  const title = isSubcategory
    ? "Manage Subcategories"
    : isCategory
      ? "Manage Categories"
      : isBrand
        ? "Manage Brands"
        : "Variant Requests";

  const requestType = isCategory
    ? "CATEGORY"
    : isBrand
      ? "BRAND"
      : variantRequestType;

  const visibleRequests = useMemo(() => (requests || []).filter((request) => {
    if (isCategory) {
      return request.type === "CATEGORY" && (isSubcategory
        ? Boolean(request.proposedData?.parentId)
        : !request.proposedData?.parentId);
    }
    if (isBrand) return request.type === "BRAND";
    return ["VARIANT_ATTRIBUTE", "VARIANT_VALUE"].includes(request.type);
  }), [requests, isCategory, isSubcategory, isBrand]);

  const categoryNames = useMemo(() => new Map(
    (options?.categories || []).map((item) => [item.id, item.name])
  ), [options?.categories]);
  const attributeNames = useMemo(() => new Map(
    (options?.attributes || []).map((item) => [item.id, item.name])
  ), [options?.attributes]);

  const statusOptions = useMemo(() => [...new Set(
    visibleRequests.map((item) => item.status).filter(Boolean)
  )].sort(), [visibleRequests]);

  const parentOptions = useMemo(() => [...new Set(
    visibleRequests.map((item) => item.proposedData?.parentId).filter(Boolean)
  )].map((id) => ({ id, name: categoryNames.get(id) || `Category ${id.slice(0, 8)}` }))
    .sort((a, b) => a.name.localeCompare(b.name)), [visibleRequests, categoryNames]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const result = visibleRequests.filter((item) => {
      const data = item.proposedData || {};
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (isVariant && kindFilter !== "ALL" && item.type !== kindFilter) return false;
      if (isSubcategory && parentFilter !== "ALL" && data.parentId !== parentFilter) return false;
      if (!normalizedQuery) return true;

      const searchable = [
        data.name, data.value, data.description,
        item.type.replaceAll("_", " "), item.status,
        item.rejectionReason,
        categoryNames.get(data.parentId),
        attributeNames.get(data.attributeId),
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });

    result.sort((a, b) => {
      const aName = String(a.proposedData?.name || a.proposedData?.value || "");
      const bName = String(b.proposedData?.name || b.proposedData?.value || "");
      if (sortBy === "NAME_ASC") return aName.localeCompare(bName);
      if (sortBy === "NAME_DESC") return bName.localeCompare(aName);
      const aTime = new Date(a.createdAt).getTime() || 0;
      const bTime = new Date(b.createdAt).getTime() || 0;
      return sortBy === "OLDEST" ? aTime - bTime : bTime - aTime;
    });
    return result;
  }, [visibleRequests, searchQuery, statusFilter, kindFilter, parentFilter, sortBy,
      isVariant, isSubcategory, categoryNames, attributeNames]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / requestsPerPage));
  const currentPage = Math.min(requestPage, totalPages);
  const pagedRequests = filteredRequests.slice(
    (currentPage - 1) * requestsPerPage, currentPage * requestsPerPage
  );
  const filtersActive = Boolean(searchQuery.trim()) || statusFilter !== "ALL" ||
    kindFilter !== "ALL" || parentFilter !== "ALL" || sortBy !== "NEWEST";

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("ALL");
    setKindFilter("ALL");
    setParentFilter("ALL");
    setSortBy("NEWEST");
    setRequestPage(1);
  }

  useEffect(() => {
    resetFilters();
  }, [section]);

  async function sendRequest(event) {
    event.preventDefault();

    const result = await submit(async () => {
      const imageDetails = {};

      // Upload category images.
      if (isCategory && !isSubcategory) {
        if (categoryIcon) {
          imageDetails.iconUrl =
            await uploadMasterDataImage(
              categoryIcon,
              "categoryIcon"
            );
        }

        if (categoryImage) {
          imageDetails.imageUrl =
            await uploadMasterDataImage(
              categoryImage,
              "categoryImage"
            );
        }
      }

      // Upload brand logo.
      if (isBrand && brandLogo) {
        imageDetails.logoUrl =
          await uploadMasterDataImage(
            brandLogo,
            "brandLogo"
          );
      }

      // Submit category or subcategory.
      if (isCategory) {
        return submitCategoryRequest({
          name: name.trim(),
          ...(isSubcategory ? { parentId } : {}),
          ...details,
          ...imageDetails,
        });
      }

      // Submit brand.
      if (isBrand) {
        return submitBrandRequest({
          name: name.trim(),
          ...details,
          ...(website.trim()
            ? { website: website.trim() }
            : {}),
          ...imageDetails,
        });
      }

      // Submit variant attribute or value.
      return submitVariantRequest(
        requestType,
        requestType === "VARIANT_VALUE"
          ? {
              attributeId,
              value: value.trim(),
              ...details,
            }
          : {
              name: name.trim(),
              ...details,
            }
      );
    }, "Catalog request submitted for Admin review.");

    // Reset the form only after successful submission.
    if (result) {
      setName("");
      setParentId("");
      setDescription("");
      setJustification("");
      setSupportingInfo("");
      setWebsite("");
      setAttributeId("");
      setValue("");
      setVariantRequestType("VARIANT_ATTRIBUTE");

      setCategoryIcon(null);
      setCategoryImage(null);
      setBrandLogo(null);

      if (categoryIconInputRef.current) {
        categoryIconInputRef.current.value = "";
      }

      if (categoryImageInputRef.current) {
        categoryImageInputRef.current.value = "";
      }

      if (brandLogoInputRef.current) {
        brandLogoInputRef.current.value = "";
      }

      setFormOpen(false);
    }
  }

  function requestTypeLabel(item) {
    if (item?.type === "CATEGORY") {
      return item?.proposedData?.parentId ? "Subcategory" : "Category";
    }
    if (item?.type === "BRAND") return "Brand";
    if (item?.type === "VARIANT_ATTRIBUTE") return "Variant Attribute";
    if (item?.type === "VARIANT_VALUE") return "Variant Value";
    return String(item?.type || "Request").replaceAll("_", " ");
  }

  return (
    <>
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div>
            <h2>{title}</h2>
            <p>
              {isCategory
                ? "Submit a proposal for Super Admin approval; approved global data becomes available to eligible shops."
                : isBrand
                  ? "Request a new shared brand. Existing normalized brand names are checked before submission."
                  : "Request an approved variant attribute or value."}
            </p>
          </div>

          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={reload}>{"\u21BB"}</button>
            <button className="btn btn-primary" type="button" onClick={() => setFormOpen(true)}>
            +{" "}
            {isSubcategory
              ? "Request Subcategory"
              : isCategory
                ? "Request Category"
                : isBrand
                  ? "Request Brand"
                  : "Request Variant Data"}
          </button>
        </div>
      </div>
      </section>

      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div>
            <h3>Your requests</h3>
            <p>
              View status, Admin decisions, and rejection reasons.
            </p>
          </div>

          <span className="count-badge">
            {visibleRequests.length}
          </span>
        </div>

        <div className="catalog-request-filters" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12, alignItems: "end", padding: "16px 0", marginTop: 8,
          borderTop: "1px solid #e3e8f1"
        }}>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>Search requests</span>
            <input
              className="form-control"
              type="search"
              aria-label="Search catalog requests"
              placeholder={isVariant ? "Attribute or value name..." : isSubcategory ? "Subcategory or parent name..." : "Search by name..."}
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setRequestPage(1); }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Status</span>
            <select className="form-select" value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setRequestPage(1); }}>
              <option value="ALL">All statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          {isSubcategory && (
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Parent Category</span>
              <select className="form-select" value={parentFilter}
                onChange={(event) => { setParentFilter(event.target.value); setRequestPage(1); }}>
                <option value="ALL">All parent categories</option>
                {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          {isVariant && (
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Request Type</span>
              <select className="form-select" value={kindFilter}
                onChange={(event) => { setKindFilter(event.target.value); setRequestPage(1); }}>
                <option value="ALL">All types</option>
                <option value="VARIANT_ATTRIBUTE">Variant Attributes</option>
                <option value="VARIANT_VALUE">Variant Values</option>
              </select>
            </label>
          )}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Sort By</span>
            <select className="form-select" value={sortBy}
              onChange={(event) => { setSortBy(event.target.value); setRequestPage(1); }}>
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
              <option value="NAME_ASC">Name: A to Z</option>
              <option value="NAME_DESC">Name: Z to A</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <small className="muted-copy" aria-live="polite">
            Showing {filteredRequests.length} of {visibleRequests.length} requests
          </small>
          <button className="btn btn-sm btn-outline-secondary" type="button"
            onClick={resetFilters} disabled={!filtersActive}>Clear Filters</button>
        </div>

        {!visibleRequests.length ? (
          <div className="empty-state">
            No{" "}
            {isSubcategory
              ? "subcategory"
              : isCategory
                ? "category"
                : isBrand
                  ? "brand"
                  : "variant"}{" "}
            requests yet.
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="empty-state" role="status">
            No matching requests found. Try a different search or clear filters.
          </div>
        ) : (
          <>
<div className="table-responsive">
  <table className="table align-middle workspace-table" aria-label="Catalog requests">
    <thead>
      <tr>
        <th scope="col">Request</th>
        <th scope="col">Status</th>
        <th scope="col">Submitted</th>
        <th scope="col">Decision</th>
        <th scope="col">Details</th>
      </tr>
    </thead>
    <tbody>
      {pagedRequests.map((item) => (
        <tr key={item.id}>
          <td>
            <div className="request-cell">
              {(() => {
                const preview = ["iconUrl", "imageUrl", "logoUrl"]
                  .map((key) => item.proposedData?.[key])
                  .find((value) => typeof value === "string");
                return preview ? (
                  <ImagePreview src={preview} title="Request preview" className="record-thumb" />
                ) : null;
              })()}
              <div>
                <strong>
                  {item.proposedData.name ||
                    item.proposedData.value ||
                    item.type.replaceAll("_", " ")}
                </strong>
                <small>{item.type.replaceAll("_", " ")}</small>
              </div>
            </div>
          </td>
          <td>
            <span className={`status-pill ${item.status.toLowerCase()}`}>
              {item.status}
            </span>
          </td>
          <td>{new Date(item.createdAt).toLocaleString()}</td>
          <td>
            {item.reviewedAt ? (
              <small className="muted-copy">
                {item.status.toLowerCase()} by {item.reviewer?.name || "Super Admin"} on {new Date(item.reviewedAt).toLocaleString()}
              </small>
            ) : (
              "Pending"
            )}
          </td>
          <td>
            {item.rejectionReason && (
              <p className="rejection-copy">
                Rejection reason: {item.rejectionReason}
              </p>
            )}
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setSelectedRequest(item)}>
              View details
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={currentPage <= 1}
                  onClick={() => setRequestPage((page) => Math.max(1, page - 1))}>Previous</button>
                <span className="muted-copy">Page {currentPage} of {totalPages}</span>
                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={currentPage >= totalPages}
                  onClick={() => setRequestPage((page) => Math.min(totalPages, page + 1))}>Next</button>
              </div>
            )}
          </>
        )}
      </section>

      <Modal
        open={formOpen}
        title={
          isSubcategory
            ? "Request Subcategory"
            : isCategory
              ? "Request Category"
              : isBrand
                ? "Request Brand"
                : "Request Variant Data"
        }
        onClose={() => setFormOpen(false)}
      >
        <form
          className="workspace-form"
          onSubmit={sendRequest}
        >
          {isCategory && (
            <>
              {isSubcategory && (
                <label>
                  Parent Category
                  <select
                    className="form-select"
                    required
                    value={parentId}
                    onChange={(event) =>
                      setParentId(event.target.value)
                    }
                  >
                    <option value="">
                      Select parent category
                    </option>

                    {options.categories.map((category) => (
                      <option
                        value={category.id}
                        key={category.id}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                {isSubcategory
                  ? "Proposed Subcategory Name"
                  : "Category Name"}
                <input
                  className="form-control"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                />
              </label>

              <label>
                Description
                <textarea
                  className="form-control"
                  rows={2}
                  maxLength={2000}
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                />
              </label>

              {!isSubcategory && (
                <>
                  <label>
                    Category Icon
                    <input
                      ref={categoryIconInputRef}
                      type="file"
                      className="form-control"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setCategoryIcon(
                          event.target.files?.[0] || null
                        )
                      }
                    />
                  </label>

                  {categoryIconPreview && (
                    <img
                      src={categoryIconPreview}
                      alt="Category icon preview"
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: "cover",
                      }}
                    />
                  )}

                  <label>
                    Category Image
                    <input
                      ref={categoryImageInputRef}
                      type="file"
                      className="form-control"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setCategoryImage(
                          event.target.files?.[0] || null
                        )
                      }
                    />
                  </label>

                  {categoryImagePreview && (
                    <img
                      src={categoryImagePreview}
                      alt="Category image preview"
                      style={{
                        width: 150,
                        height: 100,
                        objectFit: "cover",
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}

          {isBrand && (
            <>
              <label>
                Brand Name
                <input
                  className="form-control"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                />
              </label>

              <label>
                Description
                <textarea
                  className="form-control"
                  rows={2}
                  maxLength={2000}
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                />
              </label>

              <label>
                Website
                <input
                  className="form-control"
                  type="url"
                  value={website}
                  onChange={(event) =>
                    setWebsite(event.target.value)
                  }
                />
              </label>

              <label>
                Brand Logo
                <input
                  ref={brandLogoInputRef}
                  type="file"
                  className="form-control"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setBrandLogo(
                      event.target.files?.[0] || null
                    )
                  }
                />
              </label>

              {brandLogoPreview && (
                <img
                  src={brandLogoPreview}
                  alt="Brand logo preview"
                  style={{
                    width: 100,
                    height: 100,
                    objectFit: "contain",
                  }}
                />
              )}
            </>
          )}

          {isVariant && (
            <>
              <label>
                Request Type
                <select
                  className="form-select"
                  value={variantRequestType}
                  onChange={(event) => {
                    setVariantRequestType(event.target.value);
                    setAttributeId("");
                    setValue("");
                    setName("");
                  }}
                >
                  <option value="VARIANT_ATTRIBUTE">
                    Variant attribute
                  </option>
                  <option value="VARIANT_VALUE">
                    Variant value
                  </option>
                </select>
              </label>

              {requestType === "VARIANT_VALUE" ? (
                <>
                  <label>
                    Attribute
                    <select
                      className="form-select"
                      required
                      value={attributeId}
                      onChange={(event) =>
                        setAttributeId(event.target.value)
                      }
                    >
                      <option value="">
                        Select attribute
                      </option>

                      {options.attributes.map((attribute) => (
                        <option
                          value={attribute.id}
                          key={attribute.id}
                        >
                          {attribute.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    New value
                    <input
                      className="form-control"
                      required
                      maxLength={80}
                      value={value}
                      onChange={(event) =>
                        setValue(event.target.value)
                      }
                    />
                  </label>
                </>
              ) : (
                <label>
                  Attribute name
                  <input
                    className="form-control"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                  />
                </label>
              )}
            </>
          )}

          <div className="modal-actions">
            <button
              className="btn btn-outline-secondary"
              type="button"
              disabled={busy}
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </Modal>
          <Modal open={Boolean(selectedRequest)} title={selectedRequest ? `${requestTypeLabel(selectedRequest)} Request Details` : "Request Details"} className="catalog-request-modal" onClose={() => setSelectedRequest(null)}>
        {selectedRequest && (
          <div className="request-details">
            <div className="request-image-grid">
              {[
                { key: "iconUrl", title: "Category Icon", className: "category-icon-preview" },
                { key: "imageUrl", title: "Category Image", className: "category-image-preview" },
                { key: "logoUrl", title: "Brand Logo", className: "brand-logo-preview" }
              ].map(({ key, title, className }) => {
                const imagePath = selectedRequest.proposedData?.[key];
                if (!imagePath || typeof imagePath !== "string") return null;
                return (
                  <div className="request-image-card" key={key}>
                    <h4>{title}</h4>
                    <div className="request-image-container">
                      <ImagePreview src={imagePath} title={title} className={className} />
                    </div>
                  </div>
                );
              })}
            </div>
            <dl className="request-details-list">
              {Object.entries(selectedRequest.proposedData || {})
                .filter(([key]) => !["iconUrl", "imageUrl", "logoUrl"].includes(key))
                .map(([key, entry]) => (
                  <div key={key}>
                    <dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt>
                    <dd>{String(entry ?? "")}</dd>
                  </div>
                ))}
            </dl>
            {selectedRequest.rejectionReason && (
              <p className="rejection-copy">Rejection reason: {selectedRequest.rejectionReason}</p>
            )}
          </div>
        )}
      </Modal>
</>
  );
}


function ImagePreview({ src, title, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="image-fallback">Image unavailable</div>;
  }
  return (
    <img
      src={resolveMediaUrl(src)}
      alt={title}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
