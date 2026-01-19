# Design Guidelines: Oura API Natural Language Query Application

## Design Approach

**Selected Approach:** Design System - Clean Data-Focused Health Application

Drawing inspiration from Apple Health, modern wellness apps (Whoop, Oura), and Notion's chat interface patterns. This application prioritizes **clarity, readability, and trust** - essential for health data applications where users need to quickly comprehend their wellness metrics.

---

## Core Design Elements

### Typography

**Font Stack:** Inter (primary) via Google Fonts CDN
- **Hero/Headers:** text-4xl to text-6xl, font-bold (700)
- **Section Titles:** text-2xl to text-3xl, font-semibold (600)
- **Body Text:** text-base (16px), font-normal (400), leading-relaxed
- **Chat Messages:** text-sm to text-base, font-normal
- **Data Labels:** text-xs to text-sm, font-medium (500), uppercase tracking-wide
- **Metrics/Numbers:** text-3xl to text-5xl, font-bold, tabular-nums

### Layout System

**Spacing Units:** Tailwind utilities of **4, 6, 8, 12, 16, 24**
- Component padding: p-6, p-8
- Section spacing: py-12, py-16, py-24
- Card gaps: gap-4, gap-6
- Element margins: mb-4, mb-6, mb-8

**Container Strategy:**
- Max-width: max-w-7xl for main content areas
- Chat interface: max-w-4xl centered
- Data cards: max-w-6xl grid layouts

---

## Component Library

### 1. Hero Section
**Layout:** Full-width banner with gradient overlay, centered content
- Large heading explaining the app purpose
- Subheading describing natural language querying capability
- Primary CTA: "Connect Your Oura Ring" button with backdrop-blur
- Supporting text: "Ask questions about your sleep, activity, and recovery in plain English"
- Background: Abstract wellness imagery (soft, calming health/sleep visuals)

### 2. Chat Interface (Primary Feature)
**Design Pattern:** Modern chat UI with wellness aesthetics

**Chat Container:**
- max-w-4xl centered with rounded-2xl card
- Subtle shadow (shadow-lg)
- Padding: p-8
- Minimum height for comfortable conversation flow

**Message Bubbles:**
- User messages: Aligned right, rounded-2xl, px-6 py-4
- AI responses: Aligned left, rounded-2xl, px-6 py-4, with subtle border
- Avatar indicators for AI (small icon)
- Timestamps: text-xs below messages

**Input Area:**
- Fixed bottom section with backdrop-blur
- Large textarea with rounded-xl borders
- "Ask about your Oura data..." placeholder
- Send button with icon (Heroicons paper-airplane)
- Character count indicator (text-xs)

### 3. Data Visualization Cards
**Metric Cards:**
- Grid layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Rounded-xl cards with p-6
- Each card structure:
  - Small icon (24px) from Heroicons (heart, moon, activity, trending-up)
  - Label text-sm font-medium uppercase
  - Large number display text-4xl font-bold tabular-nums
  - Trend indicator with small arrow icon
  - Subtle divider line

**Chart Containers:**
- Full-width or 2-column layouts
- Rounded-2xl cards with p-8
- Title with icon, text-lg font-semibold
- Recharts area/line charts for sleep and activity trends
- Legend positioned below charts
- Responsive: stack on mobile

### 4. Navigation
**Header:**
- Sticky top navigation with backdrop-blur
- Logo/app name on left (text-xl font-bold)
- Navigation items centered: "Dashboard" "History" "Settings"
- User profile/logout on right
- Height: h-16, px-8

**Mobile:** Hamburger menu with slide-out drawer

### 5. Authentication/Onboarding
**Oura Connection Card:**
- Centered card max-w-md
- Icon illustration (large Oura ring graphic)
- Heading: "Connect Your Oura Ring"
- Description paragraph
- Primary button: "Authenticate with Oura"
- Secondary link: "Learn about Oura API"
- Padding: p-12

### 6. Data States
**Loading:**
- Skeleton screens for data cards
- Pulse animation on loading elements
- Spinner with "Analyzing your data..." text

**Empty State:**
- Centered content with illustration
- "No data available" heading
- Helpful description
- CTA to connect or sync data

**Error State:**
- Alert component with rounded-lg
- Icon indicator (exclamation-circle)
- Clear error message
- Retry button

### 7. Footer
**Multi-Column Layout:**
- 3-column grid on desktop (grid-cols-1 md:grid-cols-3)
- Column 1: App description, social links
- Column 2: Quick links (Privacy, Terms, API Docs, Support)
- Column 3: Newsletter signup (if applicable), contact info
- Bottom bar: Copyright, powered by Oura/OpenAI badges
- Padding: py-16 px-8

---

## Interaction Patterns

### Buttons
**Primary CTA:** rounded-full, px-8 py-4, text-base font-semibold, shadow-lg
- Buttons over images: backdrop-blur-sm for readability

**Secondary:** rounded-full, px-6 py-3, border-2, font-medium

**Icon Buttons:** rounded-full, p-3, hover scale effect

### Forms
**Input Fields:**
- rounded-xl borders
- px-4 py-3
- Focus ring with ring-2
- Label above: text-sm font-medium mb-2

### Cards
**Standard Pattern:**
- rounded-xl to rounded-2xl
- Subtle shadow (shadow-md)
- Padding: p-6 to p-8
- Hover: subtle shadow-lg transition

---

## Responsive Behavior

**Breakpoints:**
- Mobile: Base styles, single column
- Tablet (md:): 2-column grids, horizontal navigation
- Desktop (lg:): 3-column grids, full layouts, max-w containers

**Chat Interface:** 
- Full-width mobile
- max-w-4xl tablet+
- Sticky input on mobile

**Data Cards:**
- Stack vertically on mobile
- 2-up on tablet
- 3-up on desktop

---

## Icons
**Library:** Heroicons via CDN (outline style for UI, solid for emphasis)

**Common Icons:**
- health-related: heart, activity, moon, sun, trending-up
- UI: paper-airplane (send), menu (hamburger), x (close), chevron-right
- Status: check-circle, exclamation-circle, information-circle

---

## Images

**Hero Section:** 
Large hero image featuring calming wellness/sleep imagery - abstract visualization of sleep patterns, soft gradient overlays, or serene bedroom/meditation scenes. Image should convey health, rest, and technology harmony.

**Onboarding:**
Product illustration of Oura ring with glowing elements to indicate data connectivity.

**Empty States:**
Friendly illustrations for "no data yet" states (abstract health icons, simple line art).

---

## Key Design Principles

1. **Clarity First:** Health data must be instantly readable - prioritize contrast and hierarchy
2. **Calm Aesthetic:** Wellness apps should feel peaceful and trustworthy, not aggressive
3. **Data Density Balance:** Show enough information without overwhelming
4. **Conversational UI:** Chat interface should feel natural and inviting
5. **Progressive Disclosure:** Start simple, reveal complexity as needed