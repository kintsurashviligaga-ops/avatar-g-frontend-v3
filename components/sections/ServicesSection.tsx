"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SERVICE_REGISTRY } from "@/lib/service-registry";

const services = SERVICE_REGISTRY.filter((service) => service.enabled);

export default function ServicesSection() {
  return (
    <section className="py-24 bg-white/5">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            AI <span className="text-[#00FFFF]">Services</span>
          </h2>
          <p className="text-gray-400 text-lg">
            {services.length} active services connected to your Avatar G workspace
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, idx) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
            >
              <Link
                href={service.route}
                className="group block p-6 bg-gradient-to-br from-white/10 to-transparent border border-white/10 rounded-2xl hover:border-[#00FFFF]/50 transition-all h-full"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="text-4xl">{service.icon}</span>
                </div>
                
                <h3 className="text-xl font-semibold mb-2 group-hover:text-[#00FFFF] transition-colors">
                  {service.name}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  {service.description}
                </p>
                
                <div className="flex items-center gap-2 text-[#00FFFF] text-sm font-medium">
                  <span>Launch Service</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
