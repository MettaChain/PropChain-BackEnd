// @ts-nocheck

import {
  PrismaClient,
  UserRole,
  PropertyStatus,
  TransactionStatus,
  TransactionType,
  DocumentType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CITIES = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Miami', state: 'FL' },
];

const NEIGHBORHOODS = [
  {
    name: 'Manhattan',
    city: 'New York',
    state: 'NY',
    walkScore: 98,
    transitScore: 100,
    bikeScore: 72,
    crimeIndex: 28.5,
    schoolRating: 7.2,
  },
  {
    name: 'Brooklyn',
    city: 'New York',
    state: 'NY',
    walkScore: 95,
    transitScore: 95,
    bikeScore: 68,
    crimeIndex: 31.2,
    schoolRating: 6.8,
  },
  {
    name: 'Hollywood',
    city: 'Los Angeles',
    state: 'CA',
    walkScore: 82,
    transitScore: 62,
    bikeScore: 55,
    crimeIndex: 42.1,
    schoolRating: 5.9,
  },
  {
    name: 'Lincoln Park',
    city: 'Chicago',
    state: 'IL',
    walkScore: 93,
    transitScore: 88,
    bikeScore: 82,
    crimeIndex: 22.3,
    schoolRating: 8.1,
  },
  {
    name: 'Wynwood',
    city: 'Miami',
    state: 'FL',
    walkScore: 88,
    transitScore: 55,
    bikeScore: 72,
    crimeIndex: 35.6,
    schoolRating: 5.4,
  },
  {
    name: 'Upper West Side',
    city: 'New York',
    state: 'NY',
    walkScore: 97,
    transitScore: 98,
    bikeScore: 70,
    crimeIndex: 24.8,
    schoolRating: 8.5,
  },
  {
    name: 'River Oaks',
    city: 'Houston',
    state: 'TX',
    walkScore: 45,
    transitScore: 30,
    bikeScore: 35,
    crimeIndex: 12.4,
    schoolRating: 9.2,
  },
  {
    name: 'Bucktown',
    city: 'Chicago',
    state: 'IL',
    walkScore: 91,
    transitScore: 85,
    bikeScore: 88,
    crimeIndex: 25.7,
    schoolRating: 7.4,
  },
  {
    name: 'Coconut Grove',
    city: 'Miami',
    state: 'FL',
    walkScore: 85,
    transitScore: 48,
    bikeScore: 65,
    crimeIndex: 29.8,
    schoolRating: 6.7,
  },
  {
    name: 'Silver Lake',
    city: 'Los Angeles',
    state: 'CA',
    walkScore: 78,
    transitScore: 58,
    bikeScore: 52,
    crimeIndex: 38.9,
    schoolRating: 6.2,
  },
];

const USERS_DATA = [
  {
    firstName: 'James',
    lastName: 'Wilson',
    email: 'james.wilson@propchain.io',
    role: UserRole.ADMIN,
  },
  { firstName: 'Sarah', lastName: 'Chen', email: 'sarah.chen@propchain.io', role: UserRole.AGENT },
  {
    firstName: 'Michael',
    lastName: 'Rodriguez',
    email: 'michael.rodriguez@propchain.io',
    role: UserRole.AGENT,
  },
  {
    firstName: 'Emily',
    lastName: 'Thompson',
    email: 'emily.thompson@propchain.io',
    role: UserRole.AGENT,
  },
  { firstName: 'David', lastName: 'Kim', email: 'david.kim@propchain.io', role: UserRole.AGENT },
  {
    firstName: 'Jessica',
    lastName: 'Brown',
    email: 'jessica.brown@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Daniel',
    lastName: 'Garcia',
    email: 'daniel.garcia@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Amanda',
    lastName: 'Martinez',
    email: 'amanda.martinez@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Christopher',
    lastName: 'Anderson',
    email: 'chris.anderson@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Ashley',
    lastName: 'Taylor',
    email: 'ashley.taylor@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Matthew',
    lastName: 'Thomas',
    email: 'matthew.thomas@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Jennifer',
    lastName: 'Hernandez',
    email: 'jennifer.hernandez@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Andrew',
    lastName: 'Moore',
    email: 'andrew.moore@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Stephanie',
    lastName: 'Jackson',
    email: 'stephanie.jackson@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Joshua',
    lastName: 'White',
    email: 'joshua.white@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Nicole',
    lastName: 'Harris',
    email: 'nicole.harris@propchain.io',
    role: UserRole.USER,
  },
  { firstName: 'Ryan', lastName: 'Clark', email: 'ryan.clark@propchain.io', role: UserRole.USER },
  { firstName: 'Megan', lastName: 'Lewis', email: 'megan.lewis@propchain.io', role: UserRole.USER },
  { firstName: 'Brandon', lastName: 'Lee', email: 'brandon.lee@propchain.io', role: UserRole.USER },
  {
    firstName: 'Lauren',
    lastName: 'Walker',
    email: 'lauren.walker@propchain.io',
    role: UserRole.USER,
  },
  { firstName: 'Kevin', lastName: 'Hall', email: 'kevin.hall@propchain.io', role: UserRole.USER },
  {
    firstName: 'Rachel',
    lastName: 'Allen',
    email: 'rachel.allen@propchain.io',
    role: UserRole.USER,
  },
  {
    firstName: 'Tyler',
    lastName: 'Young',
    email: 'tyler.young@propchain.io',
    role: UserRole.AGENT,
  },
  {
    firstName: 'Samantha',
    lastName: 'King',
    email: 'samantha.king@propchain.io',
    role: UserRole.USER,
  },
];

const PROPERTY_TEMPLATES = [
  {
    title: 'Modern Downtown Loft',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1200,
    priceBase: 650000,
  },
  {
    title: 'Luxury Penthouse Suite',
    type: 'condo',
    bedrooms: 3,
    bathrooms: 3,
    sqft: 2800,
    priceBase: 2800000,
  },
  {
    title: 'Charming Victorian Home',
    type: 'house',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 3200,
    priceBase: 1200000,
  },
  {
    title: 'Cozy Studio Apartment',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 550,
    priceBase: 285000,
  },
  {
    title: 'Spacious Family Residence',
    type: 'house',
    bedrooms: 5,
    bathrooms: 4,
    sqft: 4500,
    priceBase: 1850000,
  },
  {
    title: 'Urban Townhouse',
    type: 'townhouse',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1800,
    priceBase: 720000,
  },
  {
    title: 'Beachfront Condo',
    type: 'condo',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1400,
    priceBase: 980000,
  },
  {
    title: 'Historic Brownstone',
    type: 'house',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2900,
    priceBase: 2100000,
  },
  {
    title: 'Minimalist City Flat',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 680,
    priceBase: 350000,
  },
  {
    title: 'Suburban Estate',
    type: 'house',
    bedrooms: 6,
    bathrooms: 5,
    sqft: 5800,
    priceBase: 3200000,
  },
  {
    title: 'Garden-Level Apartment',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    sqft: 950,
    priceBase: 380000,
  },
  {
    title: 'Contemporary Townhome',
    type: 'townhouse',
    bedrooms: 3,
    bathrooms: 3,
    sqft: 2200,
    priceBase: 890000,
  },
  {
    title: 'High-Rise Corner Unit',
    type: 'condo',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1350,
    priceBase: 780000,
  },
  {
    title: 'Renovated Colonial',
    type: 'house',
    bedrooms: 4,
    bathrooms: 2,
    sqft: 2600,
    priceBase: 950000,
  },
  {
    title: 'Artist Loft Space',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 1100,
    priceBase: 520000,
  },
  {
    title: 'Executive Townhouse',
    type: 'townhouse',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2800,
    priceBase: 1350000,
  },
  {
    title: 'Sunlit Corner Condo',
    type: 'condo',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1600,
    priceBase: 680000,
  },
  {
    title: 'Craftsman Bungalow',
    type: 'house',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1900,
    priceBase: 620000,
  },
  {
    title: 'Skyline View Apartment',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1050,
    priceBase: 590000,
  },
  {
    title: 'Mediterranean Villa',
    type: 'house',
    bedrooms: 5,
    bathrooms: 4,
    sqft: 4200,
    priceBase: 2750000,
  },
  {
    title: 'Compact Urban Studio',
    type: 'apartment',
    bedrooms: 0,
    bathrooms: 1,
    sqft: 420,
    priceBase: 225000,
  },
  {
    title: 'Duplex Penthouse',
    type: 'condo',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 3100,
    priceBase: 3500000,
  },
  {
    title: 'Mid-Century Ranch',
    type: 'house',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1700,
    priceBase: 480000,
  },
  {
    title: 'Modern Mixed-Use Loft',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 850,
    priceBase: 410000,
  },
  {
    title: 'Luxury Waterfront Estate',
    type: 'house',
    bedrooms: 6,
    bathrooms: 5,
    sqft: 6200,
    priceBase: 4800000,
  },
  {
    title: 'Garden Townhouse',
    type: 'townhouse',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1400,
    priceBase: 550000,
  },
  {
    title: 'Penthouse Corner Suite',
    type: 'condo',
    bedrooms: 3,
    bathrooms: 3,
    sqft: 2400,
    priceBase: 2200000,
  },
  {
    title: 'Brick Row House',
    type: 'house',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1850,
    priceBase: 780000,
  },
  {
    title: 'Smart Home Residence',
    type: 'house',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 3000,
    priceBase: 1150000,
  },
  {
    title: 'Elegant Walk-Up Flat',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    priceBase: 420000,
  },
  {
    title: 'New Construction Home',
    type: 'house',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2750,
    priceBase: 980000,
  },
  {
    title: 'Lakeview Condo',
    type: 'condo',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1200,
    priceBase: 560000,
  },
  {
    title: 'Renovated Loft Apartment',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 780,
    priceBase: 390000,
  },
  {
    title: 'Family-Friendly Townhome',
    type: 'townhouse',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2500,
    priceBase: 920000,
  },
  {
    title: 'Sleek Modern Condo',
    type: 'condo',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 700,
    priceBase: 340000,
  },
  {
    title: 'Spanish Revival Home',
    type: 'house',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 2100,
    priceBase: 850000,
  },
  {
    title: 'Converted Warehouse Loft',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1500,
    priceBase: 710000,
  },
  {
    title: 'Cape Cod Cottage',
    type: 'house',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1650,
    priceBase: 530000,
  },
  {
    title: 'Executive Suite Condo',
    type: 'condo',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1900,
    priceBase: 1050000,
  },
  {
    title: 'Tree-Lined Street Townhouse',
    type: 'townhouse',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 2000,
    priceBase: 820000,
  },
  {
    title: 'Panoramic View Apartment',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1100,
    priceBase: 640000,
  },
  {
    title: 'Craftsman Family Home',
    type: 'house',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2800,
    priceBase: 1080000,
  },
  {
    title: 'Converted Industrial Loft',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 950,
    priceBase: 460000,
  },
  {
    title: 'Charming Garden Condo',
    type: 'condo',
    bedrooms: 2,
    bathrooms: 1,
    sqft: 980,
    priceBase: 395000,
  },
  {
    title: 'Stately Colonial Manor',
    type: 'house',
    bedrooms: 5,
    bathrooms: 4,
    sqft: 4000,
    priceBase: 2400000,
  },
  {
    title: 'City Edge Townhouse',
    type: 'townhouse',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1300,
    priceBase: 540000,
  },
  {
    title: 'Luxury Corner Apartment',
    type: 'apartment',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1700,
    priceBase: 920000,
  },
  {
    title: 'Sunshine State Villa',
    type: 'house',
    bedrooms: 4,
    bathrooms: 3,
    sqft: 3100,
    priceBase: 1450000,
  },
  {
    title: 'Boutique Condo Residence',
    type: 'condo',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1150,
    priceBase: 475000,
  },
  {
    title: 'Restored Farmhouse',
    type: 'house',
    bedrooms: 4,
    bathrooms: 2,
    sqft: 2400,
    priceBase: 790000,
  },
  {
    title: 'Metro Center Apartment',
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 620,
    priceBase: 310000,
  },
];

const STREET_NAMES = [
  'Main St',
  'Oak Ave',
  'Pine Blvd',
  'Elm Dr',
  'Maple Ln',
  'Cedar Ct',
  'Walnut St',
  'Birch Ave',
  'Spruce Way',
  'Ash Blvd',
  'Harbor Dr',
  'Market St',
  'Broadway',
  'Lexington Ave',
  'Park Ave',
  'Sunset Blvd',
  'Michigan Ave',
  'Lincoln Ave',
  'Congress St',
  'Bayshore Blvd',
];

const FEATURES = [
  ['Hardwood Floors', 'Central AC', 'In-Unit Laundry'],
  ['Rooftop Deck', 'Concierge', 'Gym Access'],
  ['Backyard', 'Garage', 'Fireplace'],
  ['Stainless Appliances', 'Granite Counters', 'Walk-in Closet'],
  ['Balcony', 'Pool Access', 'Storage Unit'],
  ['Smart Home', 'Solar Panels', 'EV Charging'],
  ['Wine Cellar', 'Home Office', 'Mudroom'],
  ['Floor-to-Ceiling Windows', 'Exposed Brick', 'High Ceilings'],
  ['Private Garden', 'Security System', 'Double-Pane Windows'],
  ['Open Floor Plan', 'Kitchen Island', 'Breakfast Nook'],
];

const DOCUMENT_TYPES = [
  DocumentType.TITLE_DEED,
  DocumentType.INSPECTION_REPORT,
  DocumentType.APPRAISAL,
  DocumentType.CONTRACT,
  DocumentType.DISCLOSURE,
  DocumentType.PHOTO,
  DocumentType.FLOOR_PLAN,
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDecimal(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateAddress(city: string): string {
  const num = randomInt(100, 9999);
  const street = randomItem(STREET_NAMES);
  return `${num} ${street}`;
}

function generateBlockchainHash(): string {
  return '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[randomInt(0, 15)]).join('');
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding...');

  // Clean existing data (in reverse dependency order)
  console.log('🧹 Cleaning existing data...');
  await prisma.openHouseRsvp.deleteMany();
  await prisma.openHouse.deleteMany();
  await prisma.transactionNote.deleteMany();
  await prisma.transactionMilestone.deleteMany();
  await prisma.transactionHistory.deleteMany();
  await prisma.transactionTaxStrategy.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.commission.deleteMany();
  await prisma.propertyAgent.deleteMany();
  await prisma.propertyFavorite.deleteMany();
  await prisma.propertyView.deleteMany();
  await prisma.propertyAmenity.deleteMany();
  await prisma.propertyDuplicate.deleteMany();
  await prisma.propertyImage.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.neighborhoodSchool.deleteMany();
  await prisma.neighborhoodAmenity.deleteMany();
  await prisma.neighborhood.deleteMany();
  await prisma.property.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.fraudInvestigationNote.deleteMany();
  await prisma.fraudAlert.deleteMany();
  await prisma.session.deleteMany();
  await prisma.loginHistory.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.blacklistedToken.deleteMany();
  await prisma.passwordHistory.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.userPreferences.deleteMany();
  await prisma.savedFilter.deleteMany();
  await prisma.searchAnalytics.deleteMany();
  await prisma.searchHistory.deleteMany();
  await prisma.popularSearch.deleteMany();
  await prisma.searchSuggestion.deleteMany();
  await prisma.emailEngagement.deleteMany();
  await prisma.emailBounce.deleteMany();
  await prisma.digestPreference.deleteMany();
  await prisma.linkClick.deleteMany();
  await prisma.verificationDocument.deleteMany();
  await prisma.exportJob.deleteMany();
  await prisma.user.deleteMany();
  await prisma.databaseBackup.deleteMany();
  await prisma.backupScheduleConfig.deleteMany();

  console.log('🧹 Cleaned all existing data');

  // --- Create Users ---
  console.log('👤 Creating users...');
  const hashedPassword = await bcrypt.hash('Password123!', 10);
  const users: any[] = [];

  for (const userData of USERS_DATA) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: `+1-555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
        role: userData.role,
        isVerified: true,
        trustScore: randomInt(50, 100),
      },
    });
    users.push(user);
  }
  console.log(`✅ Created ${users.length} users`);

  // --- Create Neighborhoods ---
  console.log('🏘️ Creating neighborhoods...');
  const neighborhoods: any[] = [];

  for (const hood of NEIGHBORHOODS) {
    const neighborhood = await prisma.neighborhood.upsert({
      where: { name_city_state: { name: hood.name, city: hood.city, state: hood.state } },
      update: {},
      create: {
        name: hood.name,
        city: hood.city,
        state: hood.state,
        country: 'USA',
        walkScore: hood.walkScore,
        transitScore: hood.transitScore,
        bikeScore: hood.bikeScore,
        crimeIndex: hood.crimeIndex,
        schoolRating: hood.schoolRating,
        description: `${hood.name} is a vibrant neighborhood in ${hood.city}, ${hood.state} known for its excellent amenities and community atmosphere.`,
      },
    });

    // Add schools
    const schoolCount = randomInt(2, 4);
    const schoolTypes = ['Elementary', 'Middle School', 'High School'];
    for (let i = 0; i < schoolCount; i++) {
      await prisma.neighborhoodSchool.create({
        data: {
          neighborhoodId: neighborhood.id,
          name: `${hood.name} ${schoolTypes[i % schoolTypes.length]}`,
          type: schoolTypes[i % schoolTypes.length].toLowerCase(),
          rating: randomDecimal(5.0, 10.0),
          distanceMiles: randomDecimal(0.1, 3.0),
          studentTeacherRatio: randomDecimal(10, 25, 1),
          enrollmentCount: randomInt(200, 2000),
        },
      });
    }

    // Add amenities
    const amenityData = [
      {
        category: 'dining',
        name: `${hood.name} Bistro`,
        distanceMiles: randomDecimal(0.1, 1.5),
        rating: randomDecimal(3.5, 5.0),
      },
      {
        category: 'shopping',
        name: `${hood.name} Shopping Center`,
        distanceMiles: randomDecimal(0.2, 2.0),
        rating: randomDecimal(3.0, 5.0),
      },
      {
        category: 'parks',
        name: `${hood.name} Park`,
        distanceMiles: randomDecimal(0.1, 1.0),
        rating: randomDecimal(4.0, 5.0),
      },
      {
        category: 'fitness',
        name: `${hood.name} Fitness Center`,
        distanceMiles: randomDecimal(0.3, 2.5),
        rating: randomDecimal(3.5, 5.0),
      },
    ];
    for (const amenity of amenityData) {
      await prisma.neighborhoodAmenity.create({
        data: {
          neighborhoodId: neighborhood.id,
          ...amenity,
        },
      });
    }

    neighborhoods.push(neighborhood);
  }
  console.log(`✅ Created ${neighborhoods.length} neighborhoods with schools and amenities`);

  // --- Create Properties ---
  console.log('🏠 Creating properties...');
  const properties: any[] = [];
  const agentUsers = users.filter((u: any) => u.role === UserRole.AGENT);
  const regularUsers = users.filter((u: any) => u.role === UserRole.USER);
  const propertyStatuses = [
    PropertyStatus.ACTIVE,
    PropertyStatus.ACTIVE,
    PropertyStatus.ACTIVE,
    PropertyStatus.PENDING,
    PropertyStatus.UNDER_CONTRACT,
    PropertyStatus.SOLD,
    PropertyStatus.DRAFT,
  ];

  for (let i = 0; i < PROPERTY_TEMPLATES.length; i++) {
    const template = PROPERTY_TEMPLATES[i];
    const cityData = CITIES[i % CITIES.length];
    const neighborhood = neighborhoods[i % neighborhoods.length];
    const owner = randomItem([...agentUsers, ...regularUsers]);
    const priceVariation = randomDecimal(-0.15, 0.15);
    const price = Math.round((template.priceBase * (1 + priceVariation)) / 1000) * 1000;

    const property = await prisma.property.create({
      data: {
        title: template.title,
        description: `Beautiful ${template.type} featuring ${template.bedrooms} bedrooms and ${template.bathrooms} bathrooms across ${template.sqft} sq ft. Located in the heart of ${neighborhood.name}, ${cityData.city}. This exceptional property offers modern amenities and a prime location.`,
        address: generateAddress(cityData.city),
        city: cityData.city,
        state: cityData.state,
        zipCode: `${randomInt(10000, 99999)}`,
        country: 'USA',
        price,
        propertyType: template.type,
        bedrooms: template.bedrooms || null,
        bathrooms: template.bathrooms,
        squareFeet: template.sqft,
        lotSize: template.type === 'house' ? randomDecimal(2000, 15000, 0) : null,
        yearBuilt: randomInt(1950, 2024),
        status: randomItem(propertyStatuses),
        ownerId: owner.id,
        neighborhoodId: neighborhood.id,
        latitude: randomDecimal(25.0, 48.0),
        longitude: randomDecimal(-122.0, -73.0),
        features: randomItem(FEATURES),
        tags: [template.type, cityData.city.toLowerCase(), neighborhood.name.toLowerCase()],
        viewCount: randomInt(5, 500),
        annualTaxAmount: randomDecimal(2000, 25000),
        taxAssessmentValue: price * randomDecimal(0.7, 1.1),
        taxRate: randomDecimal(0.5, 3.0),
        capRate: randomDecimal(3.0, 8.0),
        roi: randomDecimal(4.0, 15.0),
        rentalYield: randomDecimal(3.0, 10.0),
        cashFlow: randomDecimal(-500, 8000),
        hoaMonthlyFee:
          template.type === 'condo' || template.type === 'apartment'
            ? randomDecimal(200, 1200)
            : null,
        hoaAmenities: template.type === 'condo' ? ['Pool', 'Gym', 'Concierge'] : [],
      },
    });
    properties.push(property);
  }
  console.log(`✅ Created ${properties.length} properties`);

  // --- Create Property Agents ---
  console.log('🤝 Assigning agents to properties...');
  let agentAssignments = 0;
  for (const property of properties) {
    if (Math.random() > 0.4) {
      const agent = randomItem(agentUsers);
      try {
        await prisma.propertyAgent.create({
          data: {
            propertyId: property.id,
            agentId: agent.id,
            commissionRate: randomDecimal(0.02, 0.06),
            contactPhone: agent.phone,
            contactEmail: agent.email,
          },
        });
        agentAssignments++;
      } catch {
        // Skip if duplicate
      }
    }
  }
  console.log(`✅ Created ${agentAssignments} agent assignments`);

  // --- Create Property Images (metadata only, no actual files) ---
  console.log('🖼️ Creating property image records...');
  let imageCount = 0;
  for (const property of properties) {
    const numImages = randomInt(1, 4);
    for (let j = 0; j < numImages; j++) {
      const baseName = `img_${Date.now()}_${randomInt(1000, 9999)}`;
      await prisma.propertyImage.create({
        data: {
          propertyId: property.id,
          url: `/uploads/properties/${property.id}/full_${baseName}.webp`,
          thumbnailUrl: `/uploads/properties/${property.id}/thumbnail_${baseName}.webp`,
          mediumUrl: `/uploads/properties/${property.id}/medium_${baseName}.webp`,
          filename: `${baseName}.webp`,
          mimeType: 'image/webp',
          size: randomInt(100000, 2000000),
          width: randomInt(800, 1920),
          height: randomInt(600, 1080),
          order: j,
          isPrimary: j === 0,
          altText: `${property.title} - Photo ${j + 1}`,
        },
      });
      imageCount++;
    }
  }
  console.log(`✅ Created ${imageCount} property images`);

  // --- Create Property Amenities ---
  console.log('🏊 Creating property amenities...');
  const amenityTypes = [
    'Pool',
    'Gym',
    'Parking',
    'Storage',
    'Rooftop',
    'Doorman',
    'Elevator',
    'Laundry',
  ];
  let amenityCount = 0;
  for (const property of properties) {
    const numAmenities = randomInt(1, 5);
    const shuffled = [...amenityTypes].sort(() => Math.random() - 0.5);
    for (let j = 0; j < numAmenities; j++) {
      await prisma.propertyAmenity.create({
        data: {
          propertyId: property.id,
          name: shuffled[j],
          amenityType: shuffled[j].toLowerCase(),
          description: `${shuffled[j]} available at ${property.title}`,
          isAvailable: Math.random() > 0.1,
        },
      });
      amenityCount++;
    }
  }
  console.log(`✅ Created ${amenityCount} property amenities`);

  // --- Create Transactions ---
  console.log('💰 Creating transactions...');
  const transactions: any[] = [];
  const txStatuses = [
    TransactionStatus.PENDING,
    TransactionStatus.COMPLETED,
    TransactionStatus.COMPLETED,
    TransactionStatus.COMPLETED,
    TransactionStatus.CANCELLED,
  ];
  const txTypes = [TransactionType.SALE, TransactionType.PURCHASE, TransactionType.TRANSFER];

  for (let i = 0; i < 35; i++) {
    const property = randomItem(properties);
    const buyer = randomItem([...regularUsers, ...agentUsers]);
    const seller =
      property.ownerId !== buyer.id
        ? users.find((u: any) => u.id === property.ownerId) || randomItem(users)
        : randomItem(users.filter((u: any) => u.id !== buyer.id));
    const status = randomItem(txStatuses);
    const type = randomItem(txTypes);

    const tx = await prisma.transaction.create({
      data: {
        propertyId: property.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: property.price,
        type,
        status,
        blockchainHash: Math.random() > 0.3 ? generateBlockchainHash() : null,
        contractAddress: status === TransactionStatus.COMPLETED ? generateBlockchainHash() : null,
        notes: `Transaction for ${property.title}`,
        escrowStatus:
          status === TransactionStatus.PENDING
            ? 'HELD'
            : status === TransactionStatus.COMPLETED
              ? 'RELEASED'
              : 'REFUNDED',
        paymentStatus:
          status === TransactionStatus.COMPLETED
            ? 'COMPLETE'
            : status === TransactionStatus.PENDING
              ? 'PENDING'
              : 'REFUNDED',
        cancellationReason:
          status === TransactionStatus.CANCELLED ? 'Buyer withdrew from the deal' : null,
      },
    });
    transactions.push(tx);

    // Add transaction history
    await prisma.transactionHistory.create({
      data: {
        transactionId: tx.id,
        status,
        actorId: buyer.id,
        notes: `Transaction ${status.toLowerCase()}`,
      },
    });

    // Add milestones for some transactions
    if (Math.random() > 0.5) {
      const milestoneStatuses = ['PENDING', 'COMPLETED', 'DELAYED'];
      const milestoneTitles = ['Inspection', 'Appraisal', 'Financing', 'Closing'];
      await prisma.transactionMilestone.create({
        data: {
          transactionId: tx.id,
          title: randomItem(milestoneTitles),
          status: randomItem(milestoneStatuses),
          expectedDate: new Date(Date.now() + randomInt(7, 90) * 86400000),
        },
      });
    }
  }
  console.log(`✅ Created ${transactions.length} transactions`);

  // --- Create Documents ---
  console.log('📄 Creating documents...');
  let docCount = 0;
  for (const property of properties) {
    if (Math.random() > 0.3) {
      const docType = randomItem(DOCUMENT_TYPES);
      const uploader = randomItem(users);
      await prisma.document.create({
        data: {
          propertyId: property.id,
          userId: uploader.id,
          documentType: docType,
          fileName: `${docType.toLowerCase()}_${property.id.slice(0, 8)}.pdf`,
          fileUrl: `https://storage.propchain.io/documents/${docType.toLowerCase()}_${property.id.slice(0, 8)}.pdf`,
          fileSize: randomInt(50000, 5000000),
          mimeType: 'application/pdf',
          description: `${docType.replace('_', ' ')} for ${property.title}`,
          category: 'property',
          isPublic: Math.random() > 0.5,
          auditTrail: JSON.stringify([
            { action: 'UPLOADED', actorId: uploader.id, timestamp: new Date().toISOString() },
          ]),
        },
      });
      docCount++;
    }
  }
  console.log(`✅ Created ${docCount} documents`);

  // --- Create Notifications ---
  console.log('🔔 Creating notifications...');
  const notificationTypes = ['PROPERTY_ALERT', 'TRANSACTION_UPDATE', 'MARKET_UPDATE', 'SYSTEM'];
  let notifCount = 0;
  for (const user of users.slice(0, 15)) {
    const numNotifs = randomInt(2, 6);
    for (let i = 0; i < numNotifs; i++) {
      const nType = randomItem(notificationTypes);
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: `${nType.replace('_', ' ')} Notification`,
          message: `You have a new ${nType.toLowerCase().replace('_', ' ')} to review.`,
          type: nType,
          status: randomItem(['PENDING', 'DELIVERED', 'READ']),
          metadata: JSON.stringify({ source: 'system' }),
        },
      });
      notifCount++;
    }
  }
  console.log(`✅ Created ${notifCount} notifications`);

  // --- Create Open Houses ---
  console.log('🏠 Creating open houses...');
  let openHouseCount = 0;
  for (const property of properties.slice(0, 15)) {
    const startAt = new Date(Date.now() + randomInt(1, 30) * 86400000);
    const endAt = new Date(startAt.getTime() + 3 * 3600000);
    const oh = await prisma.openHouse.create({
      data: {
        propertyId: property.id,
        title: `Open House - ${property.title}`,
        description: `Join us for an exclusive viewing of ${property.title}. Refreshments provided.`,
        startAt,
        endAt,
        isCancelled: Math.random() > 0.85,
      },
    });

    // Add RSVPs
    if (!oh.isCancelled) {
      const rsvpCount = randomInt(1, 5);
      const rsvpUsers = [...regularUsers].sort(() => Math.random() - 0.5).slice(0, rsvpCount);
      for (const rsvpUser of rsvpUsers) {
        try {
          await prisma.openHouseRsvp.create({
            data: {
              openHouseId: oh.id,
              userId: rsvpUser.id,
              status: randomItem(['ATTENDING', 'MAYBE', 'DECLINED']),
            },
          });
        } catch {
          // Skip duplicate RSVPs
        }
      }
    }
    openHouseCount++;
  }
  console.log(`✅ Created ${openHouseCount} open houses with RSVPs`);

  // --- Create User Preferences ---
  console.log('⚙️ Creating user preferences...');
  let prefCount = 0;
  for (const user of users) {
    await prisma.userPreferences.create({
      data: {
        userId: user.id,
        language: 'en',
        currency: 'USD',
        timezone: 'America/New_York',
        emailNotifications: true,
        smsNotifications: Math.random() > 0.7,
        inAppNotifications: true,
        pushNotifications: Math.random() > 0.6,
        propertyAlerts: true,
        marketUpdates: Math.random() > 0.5,
        notificationFrequency: randomItem(['INSTANT', 'DAILY', 'WEEKLY']),
      },
    });
    prefCount++;
  }
  console.log(`✅ Created ${prefCount} user preferences`);

  // --- Create Property Favorites ---
  console.log('❤️ Creating property favorites...');
  let favCount = 0;
  for (const user of regularUsers) {
    const numFavs = randomInt(1, 5);
    const shuffledProps = [...properties].sort(() => Math.random() - 0.5).slice(0, numFavs);
    for (const prop of shuffledProps) {
      try {
        await prisma.propertyFavorite.create({
          data: {
            userId: user.id,
            propertyId: prop.id,
          },
        });
        favCount++;
      } catch {
        // Skip duplicate favorites
      }
    }
  }
  console.log(`✅ Created ${favCount} property favorites`);

  // --- Create API Keys ---
  console.log('🔑 Creating API keys...');
  await prisma.apiKey.create({
    data: {
      userId: users[0].id,
      name: 'Development API Key',
      keyPrefix: 'pk_dev',
      keyHash: await bcrypt.hash('pk_dev_1234567890abcdef', 10),
      permissions: ['read:properties', 'read:transactions'],
      usageCount: 150,
      lastUsedAt: new Date(),
    },
  });
  await prisma.apiKey.create({
    data: {
      userId: users[0].id,
      name: 'Integration Test Key',
      keyPrefix: 'pk_test',
      keyHash: await bcrypt.hash('pk_test_abcdef1234567890', 10),
      permissions: ['read:properties', 'write:properties', 'read:transactions'],
      usageCount: 45,
    },
  });
  console.log('✅ Created 2 API keys');

  console.log('');
  console.log('🎉 Comprehensive database seeding completed successfully!');
  console.log('─────────────────────────────────────────');
  console.log(`  👤 Users:            ${users.length}`);
  console.log(`  🏘️ Neighborhoods:    ${neighborhoods.length}`);
  console.log(`  🏠 Properties:       ${properties.length}`);
  console.log(`  🤝 Agent Assignments: ${agentAssignments}`);
  console.log(`  🖼️ Property Images:  ${imageCount}`);
  console.log(`  🏊 Property Amenities: ${amenityCount}`);
  console.log(`  💰 Transactions:     ${transactions.length}`);
  console.log(`  📄 Documents:        ${docCount}`);
  console.log(`  🔔 Notifications:    ${notifCount}`);
  console.log(`  🏠 Open Houses:      ${openHouseCount}`);
  console.log(`  ⚙️ User Preferences: ${prefCount}`);
  console.log(`  ❤️ Favorites:        ${favCount}`);
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
