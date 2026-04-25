"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Order = {
  id: string;
  buyer_login: string | null;
  total_amount: number | null;
  currency: string | null;
  fulfillment_status: string | null;
  payment_operator: string | null;
  payment_kind: string | null;
  payment_status: string | null;
  seller_note: string | null;
  updated_at: string | null;
};

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);

  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [dateFrom, setDateFrom] = useState(yesterday());
  const [dateTo, setDateTo] = useState(yesterday());
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("allegro_orders")
        .select(
          "id,buyer_login,total_amount,currency,fulfillment_status,payment_operator,payment_kind,payment_status,seller_note,updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(5000);

      if (error) {
        console.error(error);
        setErrorMessage(error.message);
        setOrders([]);
      } else {
        setOrders((data ?? []) as Order[]);
      }

      setLoading(false);
    }

    loadOrders();
  }, []);

  const statuses = useMemo(() => {
    return Array.from(
      new Set(
        orders
          .map((o) => o.fulfillment_status)
          .filter((s): s is string => Boolean(s))
      )
    ).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (
        statusFilter !== "ALL" &&
        order.fulfillment_status !== statusFilter
      ) {
        return false;
      }

      if (dateFrom || dateTo) {
        if (!order.updated_at) return false;

        const orderDate = new Date(order.updated_at).getTime();

        if (dateFrom) {
          const from = new Date(`${dateFrom}T00:00:00`).getTime();
          if (orderDate < from) return false;
        }

        if (dateTo) {
          const to = new Date(`${dateTo}T23:59:59`).getTime();
          if (orderDate > to) return false;
        }
      }

      return true;
    });
  }, [orders, dateFrom, dateTo, statusFilter]);

  const activeOrders = filteredOrders.filter(
    (o) => o.fulfillment_status !== "Anulowane"
  );

  const totalSales = activeOrders.reduce(
    (sum, order) => sum + Number(order.total_amount ?? 0),
    0
  );

  const cancelledCount = filteredOrders.filter(
    (o) => o.fulfillment_status === "Anulowane"
  ).length;

  const sumsByPaymentKind = useMemo(() => {
    const result: Record<string, number> = {};

    activeOrders.forEach((order) => {
      const key = order.payment_kind || "Brak danych";
      result[key] = (result[key] || 0) + Number(order.total_amount ?? 0);
    });

    return result;
  }, [activeOrders]);

  const sumsByOperator = useMemo(() => {
    const result: Record<string, number> = {};

    activeOrders.forEach((order) => {
      const key = order.payment_operator || "Brak danych";
      result[key] = (result[key] || 0) + Number(order.total_amount ?? 0);
    });

    return result;
  }, [activeOrders]);

  function printSimpleList() {
    const rows = filteredOrders
      .map(
        (order) => `
          <tr>
            <td>${order.buyer_login ?? ""}</td>
            <td>${Number(order.total_amount ?? 0).toFixed(2)} ${
          order.currency ?? ""
        }</td>
            <td>${order.seller_note ?? ""}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Lista zamówień Allegro</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111;
            }

            h1 {
              font-size: 20px;
              margin-bottom: 8px;
            }

            p {
              font-size: 12px;
              margin-bottom: 16px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th, td {
              border: 1px solid #999;
              padding: 6px 8px;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #eee;
            }
          </style>
        </head>
        <body>
          <h1>Lista zamówień Allegro</h1>
          <p>Zakres: ${dateFrom || "—"} do ${dateTo || "—"} | Liczba pozycji: ${
      filteredOrders.length
    }</p>

          <table>
            <thead>
              <tr>
                <th>Użytkownik</th>
                <th>Kwota</th>
                <th>Notatka</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <script>
            window.print();
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Panel zamówień Allegro
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Pobrano z Supabase: {orders.length} | Po filtrach:{" "}
              {filteredOrders.length}
            </p>
            {errorMessage && (
              <p className="mt-2 rounded-xl bg-red-100 p-3 text-sm text-red-700">
                Błąd Supabase: {errorMessage}
              </p>
            )}
          </div>

          <div className="grid gap-4 rounded-2xl bg-white p-4 shadow md:grid-cols-3">
            <div>
              <label className="block text-sm text-slate-600">Od</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600">Do</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600">
                Status realizacji
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">Wszystkie</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="text-sm text-slate-500">Liczba zamówień</div>
            <div className="mt-2 text-3xl font-bold">
              {filteredOrders.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="text-sm text-slate-500">
              Sprzedaż bez anulowanych
            </div>
            <div className="mt-2 text-3xl font-bold">
              {totalSales.toFixed(2)} PLN
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="text-sm text-slate-500">Anulowane</div>
            <div className="mt-2 text-3xl font-bold">{cancelledCount}</div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Sumy wg typu płatności
            </h2>

            {Object.entries(sumsByPaymentKind).length === 0 ? (
              <div className="text-sm text-slate-500">Brak danych</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(sumsByPaymentKind).map(([kind, sum]) => (
                  <div
                    key={kind}
                    className="flex justify-between border-b pb-2 text-sm"
                  >
                    <span>{kind}</span>
                    <strong>{sum.toFixed(2)} PLN</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Sumy wg operatora
            </h2>

            {Object.entries(sumsByOperator).length === 0 ? (
              <div className="text-sm text-slate-500">Brak danych</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(sumsByOperator).map(([operator, sum]) => (
                  <div
                    key={operator}
                    className="flex justify-between border-b pb-2 text-sm"
                  >
                    <span>{operator}</span>
                    <strong>{sum.toFixed(2)} PLN</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Prosta lista do wydruku / pobrania
          </h2>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={printSimpleList}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900"
            >
              Drukuj prostą listę
            </button>
          </div>

          <p className="mt-3 text-sm text-slate-500">
            Wydruk zawiera tylko kolumny: użytkownik, kwota, notatka.
          </p>
        </section>

        <div className="overflow-x-auto rounded-2xl bg-white shadow">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-200 text-left">
              <tr>
                <th className="p-3">Użytkownik</th>
                <th className="p-3">Kwota</th>
                <th className="p-3">Status realizacji</th>
                <th className="p-3">Typ płatności</th>
                <th className="p-3">Status płatności</th>
                <th className="p-3">Operator</th>
                <th className="p-3">Notatka</th>
                <th className="p-3">Aktualizacja</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-4 text-slate-500">
                    Ładowanie danych...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-slate-500">
                    Brak danych.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="border-t">
                    <td className="p-3">{order.buyer_login}</td>
                    <td className="p-3">
                      {Number(order.total_amount ?? 0).toFixed(2)}{" "}
                      {order.currency}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          order.fulfillment_status === "Anulowane"
                            ? "rounded-full bg-red-100 px-3 py-1 text-red-700"
                            : "rounded-full bg-green-100 px-3 py-1 text-green-700"
                        }
                      >
                        {order.fulfillment_status || "Brak statusu"}
                      </span>
                    </td>
                    <td className="p-3">{order.payment_kind}</td>
                    <td className="p-3">{order.payment_status}</td>
                    <td className="p-3">{order.payment_operator}</td>
                    <td className="p-3">{order.seller_note}</td>
                    <td className="p-3">
                      {order.updated_at
                        ? new Date(order.updated_at).toLocaleString("pl-PL")
                        : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}