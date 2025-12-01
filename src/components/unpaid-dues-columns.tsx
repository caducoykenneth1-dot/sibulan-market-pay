"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Eye } from "lucide-react";
import { type UnpaidStall } from "./UnpaidDues"; // We'll export this type from the main component

export const columns = (
  onView: (invoice: UnpaidStall) => void
): ColumnDef<UnpaidStall>[] => [
  {
    accessorKey: "vendor_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Vendor
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "stall_name",
    header: "Stall",
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "PHP",
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "due_date",
    header: "Due Date",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return (
        <Button variant="ghost" size="icon" onClick={() => onView(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      );
    },
  },
];