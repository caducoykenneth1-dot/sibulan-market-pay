import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Vendor {
  id: number;
  name: string;
  location: string;
}

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  // Load vendors
  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("vendors").select("*");
    if (error) {
      console.error("❌ Error fetching vendors:", error.message);
    } else {
      setVendors(data as Vendor[]);
    }
    setLoading(false);
  };

  // Insert vendor
  const addVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const { error } = await supabase.from("vendors").insert({ name, location });
    if (error) {
      console.error("❌ Error adding vendor:", error.message);
    } else {
      setName("");
      setLocation("");
      fetchVendors(); // refresh list
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Vendors</h1>

      {/* Form */}
      <form onSubmit={addVendor} className="mb-6 space-y-2">
        <input
          type="text"
          placeholder="Vendor name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border p-2 rounded w-full"
        />
        <input
          type="text"
          placeholder="Vendor location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="border p-2 rounded w-full"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Vendor
        </button>
      </form>

      {/* Vendor List */}
      {loading ? (
        <p>Loading vendors...</p>
      ) : vendors.length === 0 ? (
        <p>No vendors found. Add some above!</p>
      ) : (
        <ul className="list-disc pl-5">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              <span className="font-semibold">{vendor.name}</span> —{" "}
              <span>{vendor.location}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
