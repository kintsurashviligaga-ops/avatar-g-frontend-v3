"use client";

import { motion } from "framer-motion";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServiceCard from "@/components/ServiceCard";
import { MessageSquare, Image as ImageIcon, Video, Mic, FileText, Code, Palette, Music, BrainCircuit } from "lucide-react";

const allServices = [
  { title: "AI ჩატბოტი", description: "ჭკვიანი საუბარი ნებისმიერ თემაზე", icon: MessageSquare, href: "/services/chat", gradient: "from-blue-500 to-cyan-400" },
  { title: "სურათის გენერატორი", description: "შექმენი უნიკალური სურათები ტექსტიდან", icon: ImageIcon, href: "/services/image", gradient: "from-purple-500 to-pink-500" },
  { title: "ვიდეო გენერატორი", description: "AI-გენერირებული ვიდეოები", icon: Video, href: "/services/video", gradient: "from-orange-500 to-red-500" },
  { title: "ხმოვანი AI", description: "ტექსტიდან ხმამდე და ხმის კლონირება", icon: Mic, href: "/services/voice", gradient: "from-green-500 to-emerald-400" },
  { title: "ტექსტის ანალიზი", description: "დოკუმენტების ანალიზი და თარგმანი", icon: FileText, href: "/services/text", gradient: "from-yellow-500 to-orange-400" },
  { title: "კოდის გენერატორი", description: "AI-ასისტენტი პროგრამირებაში", icon: Code, href: "/services/code", gradient: "from-indigo-500 to-purple-500" },
  { title: "დიზაინის ასისტენტი", description: "UI/UX დიზაინის იდეები და ლოგოები", icon: Palette, href: "/services/design", gradient: "from-pink-500 to-rose-500" },
  { title: "მუსიკის გენერატორი", description: "AI-გენერირებული მუსიკა", icon: Music, href: "/services/music", gradient: "from-violet-500 to-purple-500" },
  { title: "მონაცემთა ანალიზი", description: "Big Data ანალიზი და ვიზუალიზაცია", icon: BrainCircuit, href: "/services/data", gradient: "from-cyan-500 to-blue-500" },
];

export default function ServicesPage() {
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">ყველა <span className="text-cyan-400">სერვისი</span></h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">აირჩიე სასურველი AI ინსტრუმენტი და დაიწყე შექმნა</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allServices.map((service, index) => <ServiceCard key={service.href} {...service} delay={index * 0.05} />)}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
