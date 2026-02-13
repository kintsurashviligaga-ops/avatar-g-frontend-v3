'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Briefcase, TrendingUp, FileText, Sparkles } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';

export default function BusinessAgentPage() {
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!query.trim()) return;
    setIsAnalyzing(true);
    // TODO: Connect to business agent API
    setTimeout(() => setIsAnalyzing(false), 2000);
  };

  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full mb-4">
              <Briefcase className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 text-sm font-medium">Business Agent</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              AI-Powered <span className="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">Business Intelligence</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Market analysis, strategy planning, and business insights powered by AI
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white mb-4">Business Query</h2>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Analyze market trends for AI SaaS products in 2026..."
                  className="w-full h-32 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-emerald-500/50"
                />
                
                <Button
                  onClick={handleAnalyze}
                  disabled={!query.trim() || isAnalyzing}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 mt-4"
                >
                  {isAnalyzing ? (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Analyze
                    </>
                  )}
                </Button>
              </Card>

              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm mt-6">
                <h2 className="text-xl font-semibold text-white mb-4">Insights & Reports</h2>
                <div className="space-y-3">
                  {['Market Analysis', 'Competitor Report', 'Growth Strategy'].map((report) => (
                    <div key={report} className="flex items-center justify-between p-4 bg-black/30 border border-white/10 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-emerald-400" />
                        <span className="text-white">{report}</span>
                      </div>
                      <span className="text-sm text-gray-400">View</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-4">Analysis Type</h3>
                <div className="space-y-3">
                  {['Market Research', 'Competitive Analysis', 'Financial Forecast', 'Strategic Planning'].map((type) => (
                    <button key={type} className="w-full text-left p-3 bg-black/30 border border-white/10 rounded-lg hover:border-emerald-500/50 transition-colors">
                      <span className="text-white text-sm">{type}</span>
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-2">Credits</h3>
                <p className="text-2xl font-bold text-emerald-300 mb-1">15 credits</p>
                <p className="text-sm text-gray-400">per analysis</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
