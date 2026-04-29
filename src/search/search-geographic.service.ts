import { Injectable } from '@nestjs/common';

export interface GeographicFilter {
  type: 'radius' | 'polygon';
  coordinates: number[][];
  radius?: number; // in miles for radius search
}

export interface Point {
  latitude: number;
  longitude: number;
}

@Injectable()
export class SearchGeographicService {
  async applyGeographicFilter(whereClause: any, geographic: GeographicFilter): Promise<any> {
    if (geographic.type === 'radius') {
      return this.applyRadiusFilter(whereClause, geographic);
    } else if (geographic.type === 'polygon') {
      return this.applyPolygonFilter(whereClause, geographic);
    }
    return whereClause;
  }

  private async applyRadiusFilter(whereClause: any, geographic: GeographicFilter): Promise<any> {
    const center = geographic.coordinates[0];
    const radius = geographic.radius || 10; // default 10 miles

    // Convert miles to degrees (approximate)
    const degrees = radius / 69;

    // Add latitude and longitude bounds for initial filtering
    whereClause.AND = [
      ...(whereClause.AND || []),
      {
        latitude: {
          gte: center[0] - degrees,
          lte: center[0] + degrees,
        },
        longitude: {
          gte: center[1] - degrees,
          lte: center[1] + degrees,
        },
      },
    ];

    return whereClause;
  }

  private async applyPolygonFilter(whereClause: any, geographic: GeographicFilter): Promise<any> {
    // Get bounding box of polygon for initial filtering
    const bounds = this.getBoundingBox(geographic.coordinates);

    whereClause.AND = [
      ...(whereClause.AND || []),
      {
        latitude: {
          gte: bounds.minLat,
          lte: bounds.maxLat,
        },
        longitude: {
          gte: bounds.minLng,
          lte: bounds.maxLng,
        },
      },
    ];

    return whereClause;
  }

  async filterByProximity(
    properties: any[],
    centerPoint: Point,
    maxDistance?: number,
  ): Promise<any[]> {
    const propertiesWithDistance = properties.map((property) => {
      if (!property.latitude || !property.longitude) {
        return { ...property, distance: Infinity };
      }

      const distance = this.calculateDistance(
        centerPoint.latitude,
        centerPoint.longitude,
        property.latitude,
        property.longitude,
      );

      return { ...property, distance };
    });

    // Filter by max distance if specified
    const filtered = maxDistance
      ? propertiesWithDistance.filter((p) => p.distance <= maxDistance)
      : propertiesWithDistance;

    // Sort by distance
    return filtered.sort((a, b) => a.distance - b.distance);
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private getBoundingBox(coordinates: number[][]): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } {
    const lats = coordinates.map((coord) => coord[0]);
    const lngs = coordinates.map((coord) => coord[1]);

    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }

  isPointInPolygon(point: Point, polygon: number[][]): boolean {
    let inside = false;
    const x = point.longitude;
    const y = point.latitude;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1];
      const yi = polygon[i][0];
      const xj = polygon[j][1];
      const yj = polygon[j][0];

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  async getNearbyProperties(
    centerPoint: Point,
    radius: number,
    limit: number = 20,
  ): Promise<any[]> {
    // This would typically use a spatial database query
    // For now, we'll use a simplified approach
    return [];
  }

  generateMapBounds(properties: any[]): {
    northeast: Point;
    southwest: Point;
  } | null {
    if (properties.length === 0) return null;

    const validProperties = properties.filter((p) => p.latitude && p.longitude);

    if (validProperties.length === 0) return null;

    const lats = validProperties.map((p) => p.latitude);
    const lngs = validProperties.map((p) => p.longitude);

    return {
      northeast: {
        latitude: Math.max(...lats),
        longitude: Math.max(...lngs),
      },
      southwest: {
        latitude: Math.min(...lats),
        longitude: Math.min(...lngs),
      },
    };
  }
}
