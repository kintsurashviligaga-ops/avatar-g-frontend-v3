"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Briefcase, Calendar, Mail, FileText, BarChart3, Users, 
  Clock, CheckCircle2, AlertCircle, Sparkles, Zap, TrendingUp,
  PieChart, DollarSign, Target, Award, Bell, Search, Filter,
  Plus, MoreHorizontal, ArrowUpRight, ArrowDownRight, Download,
  Share2, Settings, Trash2, Edit3, Copy, Check, X,
  MessageSquare, Phone, Video, MapPin, Globe, Lock,
  ChevronRight, ChevronLeft, Star, Heart, ThumbsUp,
  LayoutDashboard, ListTodo, Inbox, FolderOpen, Bookmark
} from "lucide-react"
import { ServiceShell } from "@/components/shared/ServiceShell"
import { FeatureCard } from "@/components/shared/FeatureCard"
import { WorkspacePanel } from "@/components/shared/WorkspacePanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"

// Feature definitions
const features = [
  { 
    id: 'dashboard', 
    title: 'Dashboard', 
    description: 'Executive overview & insights', 
    icon: <LayoutDashboard size={24} />, 
    gradient: 'from-blue-400 to-indigo-500',
    color: 'blue'
  },
  { 
    id: 'schedule', 
    title: 'Schedule', 
    description: 'AI-powered calendar management', 
    icon: <Calendar size={24} />, 
    gradient: 'from-green-400 to-emerald-500',
    color: 'green'
  },
  { 
    id: 'email', 
    title: 'Email AI', 
    description: 'Smart inbox & auto-replies', 
    icon: <Mail size={24} />, 
    gradient: 'from-purple-400 to-pink-500',
    color: 'purple'
  },
  { 
    id: 'reports', 
    title: 'Reports', 
    description: 'Automated analytics & insights', 
    icon: <BarChart3 size={24} />, 
    gradient: 'from-orange-400 to-red-500',
    color: 'orange'
  },
]

// Stats data
const stats = [
  { label: 'Tasks Done', value: '24', change: '+12%', trend: 'up', icon: CheckCircle2 },
  { label: 'Meetings', value: '8', change: '+3', trend: 'up', icon: Calendar },
  { label: 'Emails Sent', value: '156', change: '+24%', trend: 'up', icon: Mail },
  { label: 'Revenue', value: '$12.4K', change: '+8%', trend: 'up', icon: DollarSign },
]

// Tasks data
const tasks = [
  { id: 1, title: 'Review Q4 Financial Report', priority: 'high', status: 'in-progress', due: '2 hours', category: 'Finance' },
  { id: 2, title: 'Team Meeting - Product Launch', priority: 'high', status: 'scheduled', due: 'Today, 2:00 PM', category: 'Meeting' },
  { id: 3, title: 'Approve Marketing Budget', priority: 'medium', status: 'pending', due: 'Tomorrow', category: 'Marketing' },
  { id: 4, title: 'Client Call - TechCorp', priority: 'medium', status: 'scheduled', due: 'Today, 4:30 PM', category: 'Sales' },
  { id: 5, title: 'Update Investor Presentation', priority: 'low', status: 'todo', due: 'Next week', category: 'Investor Relations' },
]

// Calendar events
const calendarEvents = [
  { id: 1, title: 'Executive Standup', time: '09:00 - 09:30', type: 'internal', attendees: 5 },
  { id: 2, title: 'Board Meeting', time: '10:00 - 12:00', type: 'important', attendees: 8 },
  { id: 3, title: 'Lunch with Partner', time: '12:30 - 14:00', type: 'external', attendees: 2 },
  { id: 4, title: 'Product Review', time: '15:00 - 16:00', type: 'internal', attendees: 12 },
  { id: 5, title: 'Quarterly Review', time: '16:30 - 18:00', type: 'important', attendees: 20 },
]

// Email categories
const emailCategories = [
  { id: 'inbox', name: 'Inbox', count: 12, icon: Inbox },
  { id: 'starred', name: 'Starred', count: 5, icon: Star },
  { id: 'sent', name: 'Sent', count: 48, icon: Mail },
  { id: 'drafts', name: 'Drafts', count: 3, icon: FileText },
  { id: 'archive', name: 'Archive', count: 156, icon: FolderOpen },
]

// Recent emails
const recentEmails = [
  { id: 1, from: 'Sarah Chen', subject: 'Q4 Financial Results', preview: 'The quarterly results are ready for review...', time: '10:30 AM', unread: true, starred: true },
  { id: 2, from: 'Mike Ross', subject: 'Partnership Proposal', preview: 'I wanted to discuss the new partnership opportunity...', time: '09:15 AM', unread: true, starred: false },
  { id: 3, from: 'Lisa Wong', subject: 'Team Offsite Planning', preview: 'Here are the details for the upcoming team offsite...', time: 'Yesterday', unread: false, starred: true },
  { id: 4, from: 'David Kim', subject: 'Product Launch Update', preview: 'The launch is on track for next month...', time: 'Yesterday', unread: false, starred: false },
]

// Team members
const teamMembers = [
  { id: 1, name: 'Sarah Chen', role: 'CFO', status: 'online', avatar: 'SC', tasks: 8 },
  { id: 2, name: 'Mike Ross', role: 'CTO', status: 'busy', avatar: 'MR', tasks: 12 },
  { id: 3, name: 'Lisa Wong', role: 'CMO', status: 'online', avatar: 'LW', tasks: 6 },
  { id: 4, name: 'David Kim', role: 'Product Lead', status: 'away', avatar: 'DK', tasks: 9 },
  { id: 5, name: 'Emma Davis', role: 'HR Director', status: 'online', avatar: 'ED', tasks: 4 },
]

// AI suggestions
const aiSuggestions = [
  { id: 1, type: 'schedule', message: 'Reschedule 3pm meeting to 4pm to avoid conflict', action: 'Apply' },
  { id: 2, type: 'email', message: 'Draft response to Mike about partnership?', action: 'Draft' },
  { id: 3, type: 'task', message: 'Add follow-up task for board meeting', action: 'Add' },
]

export default function ExecutiveAgentPage() {
  const [activeFeature, setActiveFeature] = useState('dashboard')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Workspace')
  const [selectedEmail, setSelectedEmail] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState('inbox')
  const [isComposing, setIsComposing] = useState(false)
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' })
  const [notifications, setNotifications] = useState(3)
  const [productivityScore, setProductivityScore] = useState(87)

  // Handle feature selection
  const handleFeatureClick = (featureId: string) => {
    setActiveFeature(featureId)
    const feature = features.find(f => f.id === featureId)
    if (feature) {
      setPanelTitle(feature.title)
      setIsPanelOpen(true)
    }
  }

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/30'
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
      case 'low': return 'text-green-400 bg-green-400/10 border-green-400/30'
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/30'
    }
  }

  return (
    <ServiceShell
      title="Executive Agent"
      subtitle="Your AI-powered executive assistant for maximum productivity"
      gradient="from-blue-400 to-indigo-500"
      actions={
        <>
          <Button variant="secondary" size="sm">
            <Bell size={16} className="mr-2" />
            {notifications > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                {notifications}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm">
            <Share2 size={16} className="mr-2" /> Share
          </Button>
          <Button variant="primary" size="sm">
            <Plus size={16} className="mr-2" /> New Task
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="p-4 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Icon size={20} className="text-blue-400" />
                      </div>
                      <div className={`flex items-center gap-1 text-xs ${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                        {stat.trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {stat.change}
                      </div>
                    </div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          {/* AI Suggestions */}
          <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={20} className="text-blue-400" />
              <h3 className="font-semibold">AI Suggestions</h3>
            </div>
            <div className="space-y-3">
              {aiSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="flex items-center justify-between p-3 bg-[#05070A]/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      {suggestion.type === 'schedule' && <Calendar size={14} className="text-blue-400" />}
                      {suggestion.type === 'email' && <Mail size={14} className="text-purple-400" />}
                      {suggestion.type === 'task' && <CheckCircle2 size={14} className="text-green-400" />}
                    </div>
                    <p className="text-sm">{suggestion.message}</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs">
                    {suggestion.action}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          {/* Today's Schedule */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock size={20} className="text-blue-400" /> Today's Schedule
              </h3>
              <Button variant="ghost" size="sm">
                View All <ChevronRight size={16} />
              </Button>
            </div>
            <div className="space-y-3">
              {calendarEvents.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-4 p-3 rounded-lg bg-[#05070A] hover:bg-white/5 transition-colors group"
                >
                  <div className={`
                    w-1 h-12 rounded-full
                    ${event.type === 'important' ? 'bg-red-400' : ''}
                    ${event.type === 'internal' ? 'bg-blue-400' : ''}
                    ${event.type === 'external' ? 'bg-green-400' : ''}
                  `} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{event.title}</h4>
                    <p className="text-xs text-gray-500">{event.time}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {[...Array(Math.min(3, event.attendees))].map((_, i) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 border-2 border-[#05070A] flex items-center justify-center text-[10px] font-bold">
                          {String.fromCharCode(65 + i)}
                        </div>
                      ))}
                      {event.attendees > 3 && (
                        <div className="w-6 h-6 rounded-full bg-gray-700 border-2 border-[#05070A] flex items-center justify-center text-[10px]">
                          +{event.attendees - 3}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                      <MoreHorizontal size={16} />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>

          {/* Priority Tasks */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ListTodo size={20} className="text-blue-400" /> Priority Tasks
              </h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Filter size={14} className="mr-2" /> Filter
                </Button>
                <Button variant="primary" size="sm">
                  <Plus size={14} className="mr-2" /> Add
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-lg bg-[#05070A] hover:bg-white/5 transition-colors group"
                >
                  <button className="w-5 h-5 rounded border-2 border-gray-600 hover:border-blue-400 transition-colors flex items-center justify-center">
                    {task.status === 'done' && <Check size={14} className="text-blue-400" />}
                  </button>
                  <div className="flex-1">
                    <h4 className={`font-medium ${task.status === 'done' ? 'line-through text-gray-500' : ''}`}>
                      {task.title}
                    </h4>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="default" className={`text-xs ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </Badge>
                      <span className="text-xs text-gray-500">{task.category}</span>
                      <span className="text-xs text-gray-600">•</span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={12} /> {task.due}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Edit3 size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((feature) => (
              <FeatureCard
                key={feature.id}
                title={feature.title}
                description={feature.description}
                icon={feature.icon}
                gradient={feature.gradient}
                isActive={activeFeature === feature.id}
                onClick={() => handleFeatureClick(feature.id)}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Productivity Score */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target size={20} className="text-blue-400" /> Productivity Score
            </h3>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-gray-800"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={351.86}
                    strokeDashoffset={351.86 * (1 - productivityScore / 100)}
                    className="text-blue-400"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">{productivityScore}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tasks Completed</span>
                <span className="font-medium">24/28</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: '85%' }} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Meetings Efficiency</span>
                <span className="font-medium">92%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: '92%' }} />
              </div>
            </div>
          </Card>

          {/* Team Status */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users size={20} className="text-blue-400" /> Team Status
            </h3>
            <div className="space-y-3">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm font-bold">
                      {member.avatar}
                    </div>
                    <div className={`
                      absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0A0F1C]
                      ${member.status === 'online' ? 'bg-green-400' : ''}
                      ${member.status === 'busy' ? 'bg-red-400' : ''}
                      ${member.status === 'away' ? 'bg-yellow-400' : ''}
                    `} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{member.name}</p>
                    <p className="text-xs text-gray-500">{member.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{member.tasks} tasks</p>
                    <div className="flex gap-1 mt-1">
                      <button className="p-1 hover:bg-white/10 rounded">
                        <MessageSquare size={12} />
                      </button>
                      <button className="p-1 hover:bg-white/10 rounded">
                        <Video size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Email */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Mail size={20} className="text-blue-400" /> Quick Inbox
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsComposing(true)}>
                <Plus size={16} />
              </Button>
            </div>
            <div className="space-y-2">
              {recentEmails.slice(0, 3).map((email) => (
                <div 
                  key={email.id} 
                  onClick={() => setSelectedEmail(email.id)}
                  className={`
                    p-3 rounded-lg cursor-pointer transition-colors
                    ${email.unread ? 'bg-blue-500/10 border-l-2 border-blue-400' : 'bg-[#05070A] hover:bg-white/5'}
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{email.from}</span>
                    <span className="text-xs text-gray-500">{email.time}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{email.subject}</p>
                  <p className="text-xs text-gray-500 truncate">{email.preview}</p>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4 text-sm">
              View All Emails
            </Button>
          </Card>

          {/* Upcoming Deadlines */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle size={20} className="text-red-400" /> Upcoming Deadlines
            </h3>
            <div className="space-y-3">
              {[
                { title: 'Board Presentation', date: 'Today', urgent: true },
                { title: 'Quarterly Report', date: 'Tomorrow', urgent: true },
                { title: 'Budget Approval', date: 'In 3 days', urgent: false },
              ].map((deadline, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-[#05070A] rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${deadline.urgent ? 'bg-red-400 animate-pulse' : 'bg-yellow-400'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{deadline.title}</p>
                    <p className="text-xs text-gray-500">{deadline.date}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronRight size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          {/* Pro Tip */}
          <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30">
            <div className="flex items-start gap-3">
              <Zap className="text-blue-400 shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-400">
                  Use "Focus Mode" to block distractions during deep work sessions. 
                  AI will handle urgent notifications.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Workspace Panel */}
      <WorkspacePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        title={panelTitle}
      >
        {/* Dashboard Panel */}
        {activeFeature === 'dashboard' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 flex items-center justify-center mb-4">
                <LayoutDashboard size={48} className="text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Executive Dashboard</h3>
              <p className="text-gray-400 mb-6">
                Your command center for productivity
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Weekly Goals</h4>
                <div className="space-y-3">
                  {[
                    { goal: 'Complete 5 high-priority tasks', progress: 80 },
                    { goal: 'Attend all scheduled meetings', progress: 100 },
                    { goal: 'Review 3 project proposals', progress: 33 },
                    { goal: 'Send weekly team update', progress: 0 },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{item.goal}</span>
                        <span className="text-gray-500">{item.progress}%</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${item.progress}%` }}
                          className="h-full bg-blue-400 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Recent Activity</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span>Completed: Q4 Financial Review</span>
                    <span className="ml-auto text-xs text-gray-500">2h ago</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
                    <Mail size={14} className="text-blue-400" />
                    <span>Sent: Partnership proposal to TechCorp</span>
                    <span className="ml-auto text-xs text-gray-500">4h ago</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
                    <Calendar size={14} className="text-purple-400" />
                    <span>Scheduled: Board Meeting</span>
                    <span className="ml-auto text-xs text-gray-500">5h ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Panel */}
        {activeFeature === 'schedule' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center mb-4">
                <Calendar size={48} className="text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Schedule Manager</h3>
              <p className="text-gray-400 mb-6">
                Smart calendar optimization
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Schedule Optimization</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded">
                    <div>
                      <p className="text-sm font-medium">Focus Time Blocks</p>
                      <p className="text-xs text-gray-500">2 hours daily</p>
                    </div>
                    <Badge variant="success" className="text-xs">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded">
                    <div>
                      <p className="text-sm font-medium">Meeting Buffer</p>
                      <p className="text-xs text-gray-500">15 min between meetings</p>
                    </div>
                    <Badge variant="success" className="text-xs">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded">
                    <div>
                      <p className="text-sm font-medium">Lunch Protection</p>
                      <p className="text-xs text-gray-500">12:00 - 13:00 blocked</p>
                    </div>
                    <Badge variant="success" className="text-xs">Active</Badge>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Smart Suggestions</h4>
                <div className="space-y-2">
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-400 mb-1">Conflict Detected</p>
                    <p className="text-xs text-gray-400">Product Review overlaps with Client Call</p>
                    <Button variant="outline" size="sm" className="mt-2 text-xs">
                      Resolve
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Button variant="glow" className="w-full">
              <Plus size={16} className="mr-2" />
              Add New Event
            </Button>
          </div>
        )}

        {/* Email AI Panel */}
        {activeFeature === 'email' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center mb-4">
                <Mail size={48} className="text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Email AI</h3>
              <p className="text-gray-400 mb-6">
                Smart inbox management
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Auto-Reply Rules</h4>
                <div className="space-y-2">
                  {[
                    { name: 'Out of Office', status: 'off', desc: 'Auto-reply when busy' },
                    { name: 'Meeting Requests', status: 'on', desc: 'Suggest times automatically' },
                    { name: 'Newsletters', status: 'on', desc: 'Archive and summarize weekly' },
                  ].map((rule) => (
                    <div key={rule.name} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                      <div>
                        <p className="text-sm font-medium">{rule.name}</p>
                        <p className="text-xs text-gray-500">{rule.desc}</p>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative cursor-pointer ${rule.status === 'on' ? 'bg-purple-500' : 'bg-gray-700'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${rule.status === 'on' ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Email Categories</h4>
                <div className="space-y-2">
                  {emailCategories.map((cat) => {
                    const Icon = cat.icon
                    return (
                      <div key={cat.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className="text-gray-400" />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">{cat.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <Button variant="glow" className="w-full">
              <Plus size={16} className="mr-2" />
              Compose Email
            </Button>
          </div>
        )}

        {/* Reports Panel */}
        {activeFeature === 'reports' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-orange-400/20 to-red-500/20 flex items-center justify-center mb-4">
                <BarChart3 size={48} className="text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Automated Reports</h3>
              <p className="text-gray-400 mb-6">
                AI-generated insights & analytics
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Scheduled Reports</h4>
                <div className="space-y-3">
                  {[
                    { name: 'Daily Summary', freq: 'Daily, 8:00 AM', next: 'Tomorrow' },
                    { name: 'Weekly Performance', freq: 'Monday, 9:00 AM', next: 'In 3 days' },
                    { name: 'Monthly Financial', freq: '1st of month', next: 'In 12 days' },
                  ].map((report) => (
                    <div key={report.name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded">
                      <div>
                        <p className="text-sm font-medium">{report.name}</p>
                        <p className="text-xs text-gray-500">{report.freq}</p>
                      </div>
                      <Badge variant="default" className="text-xs">{report.next}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Quick Reports</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="text-xs">
                    <PieChart size={14} className="mr-2" /> Time Analysis
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <TrendingUp size={14} className="mr-2" /> Productivity
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Users size={14} className="mr-2" /> Team Performance
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <DollarSign size={14} className="mr-2" /> Budget Status
                  </Button>
                </div>
              </div>
            </div>

            <Button variant="glow" className="w-full">
              <Plus size={16} className="mr-2" />
              Create Custom Report
            </Button>
          </div>
        )}
      </WorkspacePanel>

      {/* Email Compose Modal */}
      <AnimatePresence>
        {isComposing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsComposing(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0A0F1C] rounded-2xl border border-white/10 w-full max-w-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="font-semibold">New Message</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsComposing(false)}>
                  <X size={20} />
                </Button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="To"
                    className="w-full bg-transparent border-b border-white/10 py-2 focus:outline-none focus:border-blue-400"
                    value={composeData.to}
                    onChange={(e) => setComposeData({...composeData, to: e.target.value})}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Subject"
                    className="w-full bg-transparent border-b border-white/10 py-2 focus:outline-none focus:border-blue-400"
                    value={composeData.subject}
                    onChange={(e) => setComposeData({...composeData, subject: e.target.value})}
                  />
                </div>
                <textarea
                  placeholder="Write your message..."
                  className="w-full h-64 bg-transparent resize-none focus:outline-none"
                  value={composeData.body}
                  onChange={(e) => setComposeData({...composeData, body: e.target.value})}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon">
                      <Paperclip size={20} />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Image size={20} />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Link size={20} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsComposing(false)}>
                      Save Draft
                    </Button>
                    <Button variant="primary">
                      <Send size={16} className="mr-2" /> Send
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ServiceShell>
  )
}
