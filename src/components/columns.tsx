"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// This type is based on what's available in Dashboard.tsx's recentPayments
export type Collection = {
  id: string;
  vendor: string;
  stallName: string;
  amount: number;
  time: string;
  date: string;
  paid_at: string | null; // Add paid_at for filtering
};

export const columns: ColumnDef<Collection>[] = [
  {
    accessorKey: "vendor",
    header: "Vendor",
  },
  {
    accessorKey: "stallName",
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
    accessorKey: "date",
    header: "Date",
  },
  {
    accessorKey: "time",
    header: "Time",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const collection = row.original;
      // You can add actions like "View Details" or "Print Receipt" here
      return <span className="text-transparent">{collection.id}</span>;
    },
  },
];