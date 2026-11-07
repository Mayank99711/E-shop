import { apiRequest } from "../apiClient.js";

export function submitCategoryRequest(proposedData) {
  return apiRequest("/api/owner/master-data-requests", {
    method: "POST",
    body: { type: "CATEGORY", proposedData }
  });
}

export function submitBrandRequest(proposedData) {
  return apiRequest("/api/owner/master-data-requests", {
    method: "POST",
    body: { type: "BRAND", proposedData }
  });
}

export function submitVariantRequest(type, proposedData) {
  return apiRequest("/api/owner/master-data-requests", {
    method: "POST",
    body: { type, proposedData }
  });
}
export async function uploadMasterDataImage(file, imageType) {
  const allowedTypes = ["categoryIcon", "categoryImage", "brandLogo"];

  if (!allowedTypes.includes(imageType)) {
    throw new Error("Invalid image type.");
  }

  if (!file) {
    throw new Error("Please select an image.");
  }

  const formData = new FormData();
  formData.append("image", file);

  const result = await apiRequest(
    `/api/owner/master-data-images/${imageType}`,
    {
      method: "POST",
      body: formData
    }
  );

  return result.data.imageUrl;
}
