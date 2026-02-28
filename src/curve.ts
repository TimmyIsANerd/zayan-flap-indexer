import { Decimal } from "decimal.js";

const BILLION: Decimal = new Decimal("1000000000");

// The latest curve is CDPV2
export class CDPV2 {
  // the initial virtual reserve
  public r: number;
  public h: number;
  public k: number;

  static defaultDexSupplyThreshold(): Decimal {
    return new Decimal(8e8);
  }

  static getCurve(r: number, h?: number, k?: number): CDPV2 {
    if (h == null) {
      return new CDPV2(r, 0, 1e9 * r);
    }
    return new CDPV2(r, h, k!);
  }

  constructor(r: number, h: number = 0, k: number = 0) {
    this.r = r;
    this.h = h;
    this.k = k;
  }

  estimateSupply(reserve: string): Decimal {
    // s = 1e9 + h - k/(r + eth)
    if (!reserve) return new Decimal(0);
    return new Decimal(BILLION).add(this.h).sub(
      new Decimal(this.k).div(new Decimal(reserve).add(this.r))
    );
  }

  estimateReserve(amount: string): Decimal {
    // eth = k/(h + 1e9 - s) - r
    if (!amount) return new Decimal(0);
    return new Decimal(this.k)
      .div(new Decimal(BILLION).add(this.h).sub(new Decimal(amount)))
      .sub(this.r);
  }

  mc(reserve: string): Decimal {
    return this.fdv(this.totalSupply(reserve).toString());
  }

  price(supply: string): Decimal {
    // Price: k/(h + 1e9 - s)^2
    const denominator = new Decimal(BILLION).add(this.h).sub(new Decimal(supply || 0));
    return new Decimal(this.k).div(denominator.pow(2));
  }

  fdv(supply: string): Decimal {
    return this.price(supply).mul(new Decimal(BILLION));
  }

  private totalSupply(reserve: string): Decimal {
    return this.estimateSupply(reserve);
  }
}