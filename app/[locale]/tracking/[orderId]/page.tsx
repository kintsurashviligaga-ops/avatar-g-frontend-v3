'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Package, TruckIcon, CheckCircle, MapPin } from 'lucide-react';

interface ShipmentEvent {
  timestamp: string;
  status: string;
  location?: string;
  description: string;
}

interface Shipment {
  id: string;
  tracking_number: string;
  carrier: string;
  status: string;
  shipped_at?: string;
  estimated_delivery_at?: string;
  delivered_at?: string;
  tracking_events: ShipmentEvent[];
}

interface TrackedOrder {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
}

interface TrackingResponse {
  order?: TrackedOrder;
  shipments?: Shipment[];
}

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTracking = useCallback(async () => {
    if (!orderId) return;

    try {
      const response = await fetch(`/api/tracking/${orderId}`);
      const data = (await response.json()) as TrackingResponse;
      setOrder(data.order || null);
      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch (error) {
      console.error('Error fetching tracking:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchTracking();
  }, [fetchTracking]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Order Not Found</h2>
          <p className="text-gray-400">Unable to find tracking information for this order</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Order Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 mb-8"
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Order #{order.orderNumber}
          </h1>
          <p className="text-gray-400">
            Placed on {new Date(order.createdAt).toLocaleDateString()}
          </p>
          <div className="mt-4 inline-block px-4 py-2 bg-blue-500/10 text-blue-500 rounded-full text-sm font-medium">
            {order.status}
          </div>
        </motion.div>

        {/* Shipments */}
        {shipments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center"
          >
            <TruckIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Preparing Shipment</h3>
            <p className="text-gray-400">
              Your order is being prepared. Tracking information will appear here once shipped.
            </p>
          </motion.div>
        ) : (
          shipments.map((shipment, index) => (
            <motion.div
              key={shipment.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 mb-6"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Shipment {index + 1}</h2>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Tracking Number</p>
                    <p className="text-white font-mono">{shipment.tracking_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Carrier</p>
                    <p className="text-white">{shipment.carrier}</p>
                  </div>
                  {shipment.estimated_delivery_at && (
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Estimated Delivery</p>
                      <p className="text-white">
                        {new Date(shipment.estimated_delivery_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              {shipment.tracking_events && shipment.tracking_events.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Tracking History</h3>
                  {shipment.tracking_events.map((event, eventIndex) => (
                    <div key={eventIndex} className="flex gap-4">
                      <div className="flex-shrink-0">
                        {eventIndex === 0 ? (
                          <CheckCircle className="w-6 h-6 text-green-500" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-gray-500" />
                        )}
                      </div>
                      <div className="flex-1 pb-4 border-l-2 border-gray-700 pl-4 ml-3">
                        <p className="text-white font-medium">{event.description}</p>
                        <p className="text-sm text-gray-400">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                        {event.location && (
                          <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                            <MapPin className="w-4 h-4" />
                            {event.location}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
