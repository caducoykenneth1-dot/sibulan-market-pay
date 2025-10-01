import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Vendor {
  id: number;
  name: string;
  location: string;
}

export default function Vendors() {
  const supabaseClient = supabase;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);

    if (!supabaseClient) {
      console.info("Supabase is not configured. Vendor data cannot be loaded.");
      setErrorMessage("Supabase is not configured. Vendor records will be available once the connection is set up.");
      setVendors([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabaseClient.from("vendors").select("*");
    if (error) {
      console.error("❌ Error fetching vendors:", error.message);
      setErrorMessage("Unable to load vendors from Supabase.");
      setVendors([]);
    } else {
      setErrorMessage(null);
      setVendors((data ?? []) as Vendor[]);
    }
    setLoading(false);
  };

  const addVendor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name) {
      return;
    }

    if (!supabaseClient) {
      setErrorMessage("Connect Supabase to add vendors.");
      return;
    }

    const { error } = await supabaseClient.from("vendors").insert({ name, location });
    if (error) {
      console.error("❌ Error adding vendor:", error.message);
      setErrorMessage("Unable to add vendor. Please try again.");
    } else {
      setErrorMessage(null);
      setName("");
      setLocation("");
      fetchVendors();
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Vendors</h1>

      {errorMessage && <p className="mb-4 text-sm text-destructive">{errorMessage}</p>}

      <form onSubmit={addVendor} className="mb-6 space-y-2">
        <input
          type="text"
          placeholder="Vendor name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="border p-2 rounded w-full"
        />
        <input
          type="text"
          placeholder="Vendor location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="border p-2 rounded w-full"
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
          Add Vendor
        </button>
      </form>

      {loading ? (
        <p>Loading vendors...</p>
      ) : vendors.length === 0 ? (
        <p>No vendors found. Add some above!</p>
      ) : (
        <ul className="list-disc pl-5">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              <span className="font-semibold">{vendor.name}</span> — <span>{vendor.location}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
