"use client"

import { motion } from "framer-motion"
import { User, Scan } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Link from "next/link"

export default function AvatarBuilderPage() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white p-8">
      <Link href="/" className="text-cyan-400 hover:underline mb-4 inline-block">← Back</Link>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Avatar Builder
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="p-8 flex items-center justify-center min-h-[300px]">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-32 h-32 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center"
            >
              <User size={48} />
            </motion.div>
          </Card>

          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Scan className="text-cyan-400" /> Biometric Scan
              </h3>
              <Button className="w-full bg-cyan-500 hover:bg-cyan-600">
                Start 3D Scan
              </Button>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">Customization</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Skin Tone</span>
                  <input type="range" className="w-32" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Face Shape</span>
                  <input type="range" className="w-32" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
