# Property Valuation API Documentation

## Overview
The Property Valuation API provides automated property value estimates based on market data, location, and property features. It integrates with external ML services and valuation APIs to provide accurate property valuations.

## Endpoints

### Get Property Valuation
```
POST /valuation/:propertyId
```

#### Description
Gets a property valuation based on its features and external market data.

#### Parameters
- `propertyId` (path): The ID of the property to value

#### Request Body
```json
{
  "location": "123 Main St, City, State",
  "bedrooms": 3,
  "bathrooms": 2,
  "squareFootage": 1500,
  "yearBuilt": 1995,
  "propertyType": "single-family",
  "lotSize": 0.25
}
```

#### Response
```json
{
  "propertyId": "property-id-string",
  "estimatedValue": 500000,
  "confidenceScore": 0.85,
  "valuationDate": "2023-12-01T10:00:00.000Z",
  "source": "combined",
  "marketTrend": "upward",
  "featuresUsed": {
    "location": "123 Main St, City, State",
    "bedrooms": 3,
    "bathrooms": 2,
    "squareFootage": 1500,
    "yearBuilt": 1995,
    "propertyType": "single-family",
    "lotSize": 0.25
  },
  "rawData": {
    "sources": [
      {
        "source": "zillow",
        "value": 510000
      },
      {
        "source": "redfin",
        "value": 495000
      }
    ]
  }
}
```

### Get Property Valuation History
```
GET /valuation/:propertyId/history
```

#### Description
Retrieves the historical valuations for a specific property.

#### Parameters
- `propertyId` (path): The ID of the property

#### Response
```json
[
  {
    "propertyId": "property-id-string",
    "estimatedValue": 500000,
    "confidenceScore": 0.85,
    "valuationDate": "2023-12-01T10:00:00.000Z",
    "source": "combined",
    "marketTrend": "upward"
  },
  {
    "propertyId": "property-id-string",
    "estimatedValue": 495000,
    "confidenceScore": 0.82,
    "valuationDate": "2023-11-01T10:00:00.000Z",
    "source": "combined",
    "marketTrend": "upward"
  }
]
```

### Get Market Trend Analysis
```
GET /valuation/trends/:location
```

#### Description
Retrieves market trend analysis for a specific location.

#### Parameters
- `location` (path): The location to analyze

#### Response
```json
{
  "location": "New York, NY",
  "trendData": [
    {
      "date": "2023-11-01T00:00:00.000Z",
      "avgValue": 750000
    },
    {
      "date": "2023-12-01T00:00:00.000Z",
      "avgValue": 765000
    }
  ],
  "trendDirection": "upward"
}
```

### Get Latest Valuation
```
GET /valuation/:propertyId/latest
```

#### Description
Retrieves the most recent valuation for a property.

#### Parameters
- `propertyId` (path): The ID of the property

#### Response
Same as Get Property Valuation endpoint.

### Batch Valuations
```
POST /valuation/batch
```

#### Description
Get valuations for multiple properties in a single request.

#### Request Body
```json
{
  "properties": [
    {
      "propertyId": "property-1",
      "features": {
        "location": "123 Main St, City, State",
        "bedrooms": 3,
        "bathrooms": 2,
        "squareFootage": 1500
      }
    },
    {
      "propertyId": "property-2",
      "features": {
        "location": "456 Oak Ave, City, State",
        "bedrooms": 4,
        "bathrooms": 3,
        "squareFootage": 2000
      }
    }
  ]
}
```

#### Response
```json
[
  {
    "propertyId": "property-1",
    "valuation": {
      "propertyId": "property-1",
      "estimatedValue": 500000,
      "confidenceScore": 0.85,
      "valuationDate": "2023-12-01T10:00:00.000Z",
      "source": "combined",
      "marketTrend": "upward"
    },
    "status": "success"
  },
  {
    "propertyId": "property-2",
    "error": "Property not found",
    "status": "error"
  }
]
```

## Features

### Integration with External APIs
- Zillow API for property valuations
- Redfin API for comparative market analysis
- CoreLogic API for comprehensive property data

### Valuation Confidence Scoring
The API provides confidence scores for each valuation, indicating the reliability of the estimate based on data quality and availability.

### Historical Tracking
All valuations are stored with timestamps, allowing for trend analysis and comparison over time.

### Market Trend Analysis
The API analyzes market trends in specific locations to provide context for individual property valuations.

### Caching Strategy
Valuation results are cached to reduce API calls to external services and improve response times.

### Error Handling
Comprehensive error handling for API failures, with fallback mechanisms and graceful degradation.

### Rate Limiting
Built-in rate limiting to prevent abuse of external valuation APIs.