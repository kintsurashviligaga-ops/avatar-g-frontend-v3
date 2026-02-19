'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@supabase/supabase-js';
import { motion } from 'framer-motion';

interface Shipment {
  id: string;
  status: string;
  carrier: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  service_level: string;
  shipment_events: Array<{
    id: string;
    status: string;
    location: string | null;
    message: string | null;
    occurred_at: string;
    source: string;
  }>;
}

interface OrderDetail {
  id: string;
  buyer_name: string;
  total_amount: number;
  fulfillment_status: string;
  shipping_address_json: unknown;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }>;
}

interface ShippingAddress {
  name?: string;
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export default function FulfillmentDetail({
  params,
}: {
  params: { id: string; locale: string };
}) {
    const parseShippingAddress = (value: unknown): ShippingAddress => {
      if (!value || typeof value !== 'object') {
        return {};
      }
      const source = value as Record<string, unknown>;
      return {
        name: typeof source.name === 'string' ? source.name : undefined,
        street: typeof source.street === 'string' ? source.street : undefined,
        city: typeof source.city === 'string' ? source.city : undefined,
        zip: typeof source.zip === 'string' ? source.zip : undefined,
        country: typeof source.country === 'string' ? source.country : undefined,
        phone: typeof source.phone === 'string' ? source.phone : undefined,
      };
    };

  const t = useTranslations();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [_activeTab, _setActiveTab] = useState<'shipments' | 'timeline'>('shipments');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('in_transit');
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select(
            `
            id,
            buyer_name,
            total_amount,
            fulfillment_status,
            shipping_address_json,
            created_at,
            order_items (
              id,
              product_name,
              quantity,
              unit_price
            )
          `
          )
          .eq('id', params.id)
          .single();

        if (orderError) throw orderError;
        setOrder(orderData);

        const { data: shipmentData, error: shipmentError } = await supabase
          .from('shipments')
          .select(
            `
            id,
            status,
            carrier,
            tracking_number,
            tracking_url,
            shipped_at,
            delivered_at,
            service_level,
            shipment_events (
              id,
              status,
              location,
              message,
              occurred_at,
              source
            )
          `
          )
          .eq('order_id', params.id)
          .eq('seller_user_id', user.id);

        if (shipmentError) throw shipmentError;
        setShipments(shipmentData || []);
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [params.id, supabase]);

  const handleUpdateShipment = async (shipmentId: string) => {
    if (!trackingNumber.trim()) {
      alert(t('shipping.fulfillment.error_tracking_number'));
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber,
          trackingUrl,
          status: selectedStatus,
          message: updateMessage || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to update shipment');

      // Refresh shipments
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('shipments')
          .select(
            `
            id,
            status,
            carrier,
            tracking_number,
            tracking_url,
            shipped_at,
            delivered_at,
            service_level,
            shipment_events (
              id,
              status,
              location,
              message,
              occurred_at,
              source
            )
          `
          )
          .eq('order_id', params.id)
          .eq('seller_user_id', user.id);

        setShipments(data || []);
      }

      setTrackingNumber('');
      setTrackingUrl('');
      setSelectedStatus('in_transit');
      setUpdateMessage('');
    } catch (error) {
      console.error('Error updating shipment:', error);
      alert(t('shipping.fulfillment.error_updating'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full" />
          </div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <p className="text-gray-600">{t('shipping.fulfillment.order_not_found')}</p>
      </div>
    );
  }

  const address = parseShippingAddress(order.shipping_address_json);
  const firstShipment = shipments[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {t('shipping.fulfillment.order_details')}
          </h1>
          <p className="text-gray-600">{order.id.substring(0, 8)}</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Summary */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('shipping.fulfillment.order_summary')}
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500">{t('shipping.fulfillment.buyer')}</p>
                  <p className="text-lg font-medium text-gray-900">{order.buyer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('shipping.fulfillment.total')}</p>
                  <p className="text-lg font-medium text-gray-900">
                    ${order.total_amount.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">
                  {t('shipping.fulfillment.shipping_address')}
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-900 font-medium">{address.name}</p>
                  <p className="text-sm text-gray-700">{address.street}</p>
                  <p className="text-sm text-gray-700">
                    {address.city}, {address.zip} {address.country}
                  </p>
                  <p className="text-sm text-gray-700">{address.phone}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-3">
                  {t('shipping.fulfillment.items')}
                </p>
                <div className="space-y-2">
                  {order.order_items?.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {item.product_name} x{item.quantity}
                      </span>
                      <span className="text-gray-900 font-medium">
                        ${(item.unit_price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Shipment Management */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('shipping.fulfillment.shipment_management')}
              </h2>

              {shipments.length === 0 ? (
                <p className="text-gray-600 mb-4">
                  {t('shipping.fulfillment.no_shipments')}
                </p>
              ) : (
                <div className="mb-6">
                  {shipments.map((shipment, idx) => (
                    <motion.div
                      key={shipment.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-gray-50 rounded-lg p-4 mb-4"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {shipment.carrier} - {shipment.service_level}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {shipment.tracking_number || 'Tracking pending'}
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {shipment.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Update Form */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-4">
                  {t('shipping.fulfillment.update_tracking')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('shipping.fulfillment.tracking_number')}
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder={t('shipping.fulfillment.enter_tracking_number')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('shipping.fulfillment.tracking_url')}
                    </label>
                    <input
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder={t('shipping.fulfillment.enter_tracking_url')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('shipping.fulfillment.status')}
                    </label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="label_created">
                        {t('shipping.fulfillment.status_label_created')}
                      </option>
                      <option value="in_transit">
                        {t('shipping.fulfillment.status_in_transit')}
                      </option>
                      <option value="out_for_delivery">
                        {t('shipping.fulfillment.status_out_for_delivery')}
                      </option>
                      <option value="delivered">
                        {t('shipping.fulfillment.status_delivered')}
                      </option>
                    </select>
                  </div>

                  <button
                    onClick={() =>
                      shipments[0] && handleUpdateShipment(shipments[0].id)
                    }
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    {saving ? t('common.saving') : t('shipping.fulfillment.update_shipment')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Sidebar - Status & Timeline */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {t('shipping.fulfillment.status')}
              </h3>
              <div
                className="px-4 py-3 rounded-lg text-center font-medium mb-4"
                style={{
                  backgroundColor:
                    order.fulfillment_status === 'delivered' ? '#dcfce7' : '#dbeafe',
                  color:
                    order.fulfillment_status === 'delivered' ? '#166534' : '#0c2d6b',
                }}
              >
                {t(`shipping.fulfillment.status_${order.fulfillment_status}`)}
              </div>

              {/* Timeline */}
              {firstShipment?.shipment_events && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-sm">
                    {t('shipping.fulfillment.timeline')}
                  </h4>
                  <div className="space-y-3">
                    {[...firstShipment.shipment_events]
                      .sort(
                        (a, b) =>
                          new Date(b.occurred_at).getTime() -
                          new Date(a.occurred_at).getTime()
                      )
                      .slice(0, 5)
                      .map((event) => (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-xs"
                        >
                          <p className="font-medium text-gray-900">{event.status}</p>
                          <p className="text-gray-500">
                            {event.location && `📍 ${event.location}`}
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            {new Date(event.occurred_at).toLocaleDateString()}
                          </p>
                        </motion.div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
