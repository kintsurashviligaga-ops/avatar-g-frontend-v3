import {
  Bot, UserCircle2, Video, ImageIcon, Music2, FileText,
  Scissors, Camera, Eye, Wand2, Mic2, Workflow, Briefcase,
  ShoppingCart, Code2, Plane, Gamepad2, Sofa,
  type LucideIcon,
} from 'lucide-react';

export interface UiService {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  group: 'Featured' | 'Create' | 'Intelligence' | 'Studio' | 'Build';
  color: string;
  keywords: string[];
  suggestions: string[];
}

export const UI_SERVICES: UiService[] = [
  { id:'agent-g',    label:'Agent G',              icon:Bot,          group:'Featured',      color:'#6366f1', keywords:['ai','chat','assistant','agent'],                    suggestions:['შექმენი სრული მარკეტინგ კამპანია','გააანალიზე ჩემი ბიზნეს მონაცემები','შექმენი კონტენტ სტრატეგია','დამეხმარე ბრენდის განვითარებაში'], description:'AI ორკესტრატორი — ყველა სერვისის კოორდინატორი' },
  { id:'avatar',     label:'Avatar Studio',        icon:UserCircle2,  group:'Create',        color:'#8b5cf6', keywords:['avatar','profile','portrait'],                      suggestions:['შექმენი პროფესიონალური ბიზნეს ავატარი','სათამაშო ავატარი ფუტურისტული სტილით','კარტული პროფილის სურათი','ტექ-მეწარმის ავატარი'], description:'AI ავატარების დიზაინი და გენერაცია' },
  { id:'video',      label:'Video Generation',     icon:Video,        group:'Create',        color:'#ef4444', keywords:['video','reel','script','film'],                     suggestions:['30 წამიანი პროდუქტის პრომო სკრიპტი','YouTube-ის ინტრო კონცეფცია','სოციალური მედიის რილი','კორპორატიული პრეზენტაციის სტრუქტურა'], description:'AI ვიდეო სკრიპტები და პროდუქცია' },
  { id:'image',      label:'Image Generation',     icon:ImageIcon,    group:'Create',        color:'#f59e0b', keywords:['image','photo','art','visual'],                     suggestions:['ფოტორეალისტური პროდუქტის მაკეტი','ვებსაიტის ჰედერის დიზაინი','ლოგოს კონცეფცია','პრეზენტაციის ფონი'], description:'AI სურათებისა და ხელოვნების გენერაცია' },
  { id:'music',      label:'Music Production',     icon:Music2,       group:'Create',        color:'#10b981', keywords:['music','audio','beat','jingle'],                    suggestions:['ვიდეოსთვის ფონური მუსიკა','ბრენდის ჯინგლი','მედიტაციის ფონი','სოციალური მედიის ბითი'], description:'AI მუსიკის კომპოზიცია და პროდუქცია' },
  { id:'copy',       label:'Text & Copy',          icon:FileText,     group:'Create',        color:'#06b6d4', keywords:['copy','text','seo','blog','content'],               suggestions:['Landing page-ის ტექსტი','SEO ბლოგ პოსტი','ელ-ფოსტის კამპანია','Instagram კაფსები'], description:'მარკეტინგული ტექსტი და კონტენტი' },
  { id:'photo',      label:'Photo Enhancement',    icon:Camera,       group:'Studio',        color:'#ec4899', keywords:['photo','enhance','retouch'],                        suggestions:['პორტრეტის განათების გაუმჯობესება','ფონის მოცილება','პროდუქტის ფოტოს ფერთა კორექცია','სურათის გამახვილება'], description:'AI ფოტოს გაუმჯობესება' },
  { id:'visual',     label:'Visual Intelligence',  icon:Eye,          group:'Intelligence',  color:'#14b8a6', keywords:['visual','analyze','audit'],                         suggestions:['ბრენდის ვიზუალური კონსისტენტობა','ეფექტური თამბნეილი','ვებსაიტის UX მიმოხილვა','ვიზუალური იერარქია'], description:'AI ვიზუალური ანალიზი' },
  { id:'prompt',     label:'Prompt Engineering',   icon:Wand2,        group:'Studio',        color:'#a855f7', keywords:['prompt','engineering','midjourney'],                suggestions:['Midjourney პრომფტი ლოგოსთვის','Customer service ბოტის პრომფტი','ChatGPT ოპტიმიზაცია','Chain-of-thought reasoning'], description:'AI მოდელებისთვის სრულყოფილი პრომფტები' },
  { id:'media',      label:'Media Production',     icon:Mic2,         group:'Studio',        color:'#f97316', keywords:['media','podcast','production'],                     suggestions:['Podcast-ის ეპიზოდის სტრუქტურა','YouTube კონტენტ კალენდარი','ვიდეო პროდუქციის checklist','მედია ტაიმლაინი'], description:'სრული მედია პროდუქციის პაიფლაინი' },
  { id:'workflow',   label:'Workflow Builder',      icon:Workflow,     group:'Build',         color:'#84cc16', keywords:['workflow','automation','pipeline'],                 suggestions:['კონტენტ გამოქვეყნების ავტომატიზაცია','Lead nurturing სეკვენცია','კლიენტის onboarding','პროდუქტის launch pipeline'], description:'ბიზნეს პროცესების ავტომატიზაცია' },
  { id:'business',   label:'Business Intelligence', icon:Briefcase,    group:'Intelligence',  color:'#3b82f6', keywords:['business','analytics','strategy','kpi'],            suggestions:['ბაზრის ტრენდების ანალიზი','კონკურენტული ანალიზი','KPI დაშბორდი','ზრდის სტრატეგია'], description:'მონაცემებზე დაფუძნებული ბიზნეს სტრატეგია' },
  { id:'shop',       label:'Digital Shop',          icon:ShoppingCart, group:'Build',         color:'#f43f5e', keywords:['shop','ecommerce','product'],                       suggestions:['პროდუქტის აღწერები','გამყიდველობის სათაურები','Upsell სტრატეგია','პრომო კამპანია'], description:'ციფრული მაღაზიის ოპტიმიზაცია' },
  { id:'code',       label:'Software Studio',       icon:Code2,        group:'Build',         color:'#22c55e', keywords:['code','software','dev','react','python'],           suggestions:['React კომპონენტი pricing table-ისთვის','Python სკრიპტი მონაცემთა დამუშავებისთვის','REST API endpoint','მონაცემთა ბაზის ოპტიმიზაცია'], description:'AI კოდის გენერაცია და მიმოხილვა' },
  { id:'tourism',    label:'Tourism Intelligence',  icon:Plane,        group:'Intelligence',  color:'#0ea5e9', keywords:['tourism','travel','georgia'],                       suggestions:['7-დღიანი საქართველოს მარშრუტი','თბილისის ტური','სასტუმროს აღწერები','კულტურული ტური'], description:'AI ტურიზმის დაგეგმვა' },
  { id:'game',       label:'Game Creator',          icon:Gamepad2,     group:'Build',         color:'#d946ef', keywords:['game','design','rpg','mobile'],                     suggestions:['მობილური თამაშის კონცეფცია','RPG პერსონაჟების ისტორიები','NPC-ების დიალოგი','Level progression სისტემა'], description:'AI თამაშის კონცეფცია და განვითარება' },
  { id:'interior',   label:'Interior Designer',     icon:Sofa,         group:'Build',         color:'#fb923c', keywords:['interior','design','room','furniture'],             suggestions:['მინიმალისტური მისაღები ოთახი','ოფისის ფერთა პალიტრა','მცირე ბინის განლაგება','სამუშაო სივრცის დიზაინი'], description:'AI ინტერიერის დიზაინი' },
  { id:'video-edit', label:'Video Editing',         icon:Scissors,     group:'Studio',        color:'#e11d48', keywords:['edit','post','montage','cut'],                      suggestions:['YouTube ვიდეოს ედიტინგ ტაიმლაინი','გადასვლები პროდუქტის დემოსთვის','ბრენდის Color grading','Thumbnail სტრატეგია'], description:'AI ვიდეო მონტაჟი' },
];

export const UI_SERVICE_GROUPS = ['Featured', 'Create', 'Intelligence', 'Studio', 'Build'] as const;

export function getUiService(id: string): UiService {
  return UI_SERVICES.find(s => s.id === id) ?? UI_SERVICES[0]!;
}
