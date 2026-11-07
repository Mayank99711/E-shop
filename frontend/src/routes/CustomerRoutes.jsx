import { Route, Routes } from "react-router-dom";
import CustomerPortal from "../pages/customer/CustomerPortal.jsx";

export default function CustomerRoutes() {
  return <Routes><Route path="*" element={<CustomerPortal />} /></Routes>;
}
