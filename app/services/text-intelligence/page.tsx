'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Languages,
  Search,
  BarChart3,
  Sparkles,
  Copy,
  Download,
  Loader2
} from 'lucide-react'

type FeatureType = 'summarize' | 'translate' | 'seo' | 'sentiment'

interface AnalysisResult {
  type: FeatureType
  result: string
  metrics?: Record<string, unknown>
}

type ServiceJob = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  error_message?: string | null
  input_payload?: {
    prompt?: string
    feature?: FeatureType
  }
  output_payload?: {
    text?: string
    usage?: {
      tokens_in?: number
      tokens_out?: number
      cost_usd?: number
    }
  }
  created_at: string
}

export default function TextIntelligencePage() {
  const t = useTranslations('services')
  const [inputText, setInputText] = useState('')
  const [activeFeature, setActiveFeature] = useState<FeatureType>('summarize')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [currentJob, setCurrentJob] = useState<ServiceJob | null>(null)
  const [history, setHistory] = useState<ServiceJob[]>([])
  const [error, setError] = useState<string | null>(null)

  const features = [
    {
      id: 'summarize' as FeatureType,
      icon: FileText,
      label: 'რეზიუმე',
      description: 'ტექსტის შეჯამება და მთავარი იდეების გამოყოფა'
    },
    {
      id: 'translate' as FeatureType,
      icon: Languages,
      label: 'თარგმანი',
      description: 'მრავალენოვანი თარგმანი AI-ით'
    },
    {
      id: 'seo' as FeatureType,
      icon: Search,
      label: 'SEO ოპტიმიზაცია',
      description: 'საძიებო სისტემებისთვის ადაპტაცია'
    },
    {
      id: 'sentiment' as FeatureType,
      icon: BarChart3,
      label: 'სენტიმენტ ანალიზი',
      description: 'ტექსტის ემოციური ტონის ანალიზი'
    }
  ]

  const metricLabels: Record<string, string> = {
    originalLength: 'საწყისი სიგრძე',
    summaryLength: 'შეჯამების სიგრძე',
    compressionRatio: 'შეკუმშვის კოეფიციენტი',
    sourceLanguage: 'წყაროს ენა',
    targetLanguage: 'სამიზნე ენა',
    confidence: 'სანდოობა',
    keywords: 'საკვანძო სიტყვები',
    readabilityScore: 'წაკითხვადობა',
    seoScore: 'SEO ქულა',
    positive: 'პოზიტიური',
    neutral: 'ნეიტრალური',
    negative: 'ნეგატიური',
  }

  const loadHistory = async () => {
    const response = await fetch('/api/app/jobs?service=text-intelligence', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json() as { jobs?: ServiceJob[] }
    setHistory((data.jobs ?? []).slice(0, 8))
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/app/jobs/${currentJob.id}?autoProcess=1`, { cache: 'no-store' })
      if (!response.ok) return

      const data = await response.json() as { job: ServiceJob }
      setCurrentJob(data.job)

      if (data.job.status === 'completed') {
        const text = data.job.output_payload?.text ?? ''
        const metrics = data.job.output_payload?.usage
        setResult({
          type: (data.job.input_payload?.feature ?? activeFeature) as FeatureType,
          result: text,
          metrics: {
            tokensIn: metrics?.tokens_in ?? 0,
            tokensOut: metrics?.tokens_out ?? 0,
            costUsd: metrics?.cost_usd ?? 0,
          },
        })
        setIsProcessing(false)
        void loadHistory()
      }

      if (data.job.status === 'failed') {
        setIsProcessing(false)
        setError(data.job.error_message || 'ანალიზი ვერ შესრულდა')
      }
    }, 2000)

    return () => {
      window.clearInterval(interval)
    }
  }, [currentJob, activeFeature])

  const handleAnalyze = async () => {
    if (!inputText.trim()) return

    setIsProcessing(true)
    setError(null)
    
    try {
      const response = await fetch('/api/app/services/text-intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: inputText,
          inputPayload: {
            feature: activeFeature,
          },
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || 'ანალიზი ვერ დაიწყო')
      }

      setCurrentJob(data.job as ServiceJob)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Analysis error')
      setIsProcessing(false)
    } finally {
      // polling flow updates final state
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.result)
    }
  }

  const handleDownload = () => {
    if (result) {
      const blob = new Blob([result.result], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `text-intelligence-${result.type}-${Date.now()}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="container mx-auto px-4 py-24 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12 space-y-4">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            <FileText className="w-8 h-8" />
          </div>
          <Badge variant="secondary" className="text-sm">ბეტა</Badge>
        </div>
        
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
          {t('text_intelligence')}
        </h1>
        
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          ტექსტის ანალიზი, რეზიუმე, თარგმანი და SEO ოპტიმიზაცია AI-ით
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {features.map((feature) => {
          const Icon = feature.icon
          const isActive = activeFeature === feature.id

          return (
            <Card
              key={feature.id}
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                isActive ? 'ring-2 ring-purple-500 shadow-lg' : ''
              }`}
              onClick={() => setActiveFeature(feature.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    isActive 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white' 
                      : 'bg-secondary'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base">{feature.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              შეიყვანე ტექსტი
            </CardTitle>
            <CardDescription>
              ჩაწერე ან ჩასვი ტექსტი ანალიზისთვის
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="ჩაწერე ან ჩასვი შენი ტექსტი აქ..."
              value={inputText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
              className="min-h-[300px] resize-none"
            />
            
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{inputText.length} სიმბოლო</span>
              <span>
                {inputText.split(/\s+/).filter(w => w.length > 0).length} სიტყვა
              </span>
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={!inputText.trim() || isProcessing}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ანალიზი მიმდინარეობს...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  ანალიზის დაწყება
                </>
              )}
            </Button>

            {currentJob && (
              <p className="text-xs text-muted-foreground">Queue status: {currentJob.status} ({currentJob.progress}%)</p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {/* Result Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                შედეგი
              </CardTitle>
              
              {result && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyze}
                    disabled={isProcessing}
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <CardDescription>
              AI-ით დამუშავებული ტექსტი
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center text-muted-foreground">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <p>აირჩიე ფუნქცია და დაიწყე ანალიზი</p>
              </div>
            ) : (
              <>
                <div className="p-4 bg-secondary/50 rounded-lg min-h-[200px]">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result.result}
                  </p>
                </div>

                {result.metrics && (
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(result.metrics).map(([key, value]) => (
                      <div
                        key={key}
                        className="p-3 bg-secondary/30 rounded-lg text-center"
                      >
                        <p className="text-xs text-muted-foreground mb-1">
                          {metricLabels[key] || 'მაჩვენებელი'}
                        </p>
                        <p className="font-semibold">{typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>ბოლო გაშვებული ტექსტური ანალიზები</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 && <p className="text-sm text-muted-foreground">ისტორია ცარიელია</p>}
          {history.map((job) => (
            <button
              key={job.id}
              type="button"
              className="w-full rounded-lg border p-3 text-left hover:bg-secondary/40"
              onClick={() => {
                setInputText(job.input_payload?.prompt ?? '')
                setActiveFeature((job.input_payload?.feature ?? 'summarize') as FeatureType)
                if (job.output_payload?.text) {
                  setResult({
                    type: (job.input_payload?.feature ?? 'summarize') as FeatureType,
                    result: job.output_payload.text,
                  })
                }
              }}
            >
              <p className="text-sm font-medium">{(job.input_payload?.prompt ?? '').slice(0, 120) || 'Text run'}</p>
              <p className="text-xs text-muted-foreground">{job.status} • {new Date(job.created_at).toLocaleString()}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Send to another service</CardTitle>
          <CardDescription>გადააგზავნე შედეგი შემდეგ ეტაპზე</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href={`/services/social-media?source=text-intelligence&text=${encodeURIComponent(result?.result || inputText)}`}>
            <Button variant="secondary">Social Media</Button>
          </Link>
          <Link href={`/services/business-agent?source=text-intelligence&text=${encodeURIComponent(result?.result || inputText)}`}>
            <Button variant="secondary">Business Agent</Button>
          </Link>
          <Link href={`/services/marketplace/listings/new?source=text-intelligence`}>
            <Button variant="secondary">Marketplace</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Service Notice */}
      <Card className="mt-8 border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="flex items-start gap-3 pt-6">
          <Sparkles className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-yellow-600 dark:text-yellow-500">
              რეალური პროვაიდერი
            </p>
            <p className="text-sm text-muted-foreground">
              ანალიზი სრულდება რეალურ AI პროვაიდერზე და ინახება job ისტორიაში. თუ პროვაიდერის API გასაღები არ არის კონფიგურირებული,
              მოთხოვნა დასრულდება შეცდომით.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
