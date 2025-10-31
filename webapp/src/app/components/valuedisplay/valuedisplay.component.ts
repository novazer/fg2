import { Component, OnInit, Input } from '@angular/core';


function calcArc(r:any, x:any, y:any, start:any, end:any) : string {
  var sx = x - r * Math.sin(start * 2 * Math.PI);
  var sy = y + r * Math.cos(start * 2 * Math.PI);
  var ex = x - r * Math.sin(end * 2 * Math.PI);
  var ey = y + r * Math.cos(end * 2 * Math.PI);
  var long = (end - start) > 0.5 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${long} 1 ${ex} ${ey}`;
}

function clamp(v:any, min:any, max:any) {
  if(v < min) {
    return min;
  }
  else if(v > max) {
    return max;
  }
  else {
    return v;
  }
}

function mix(a:any, b:any, v:any):any {
  return {
    h: a.h * (1 - v) + b.h * v,
    s: a.s * (1 - v) + b.s * v,
    l: a.l * (1 - v) + b.l * v,
  }
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
function rgbToHsl(color:{r:any, g:any, b:any}) {
  let r = color.r / 255
  let g = color.g / 255
  let b = color.b / 255;

  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s, l = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  return {h: h, s: s, l: l};
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb(color:{h:any, s:any, l:any}) {
  var r, g, b;
  function hue2rgb(p:any, q:any, t:any) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }

  if (color.s == 0) {
    r = g = b = color.l; // achromatic
  } else {

    var q = color.l < 0.5 ? color.l * (1 + color.s) : color.l + color.s - color.l * color.s;
    var p = 2 * color.l - q;

    r = hue2rgb(p, q, color.h + 1/3);
    g = hue2rgb(p, q, color.h);
    b = hue2rgb(p, q, color.h - 1/3);
  }

  return {r: r * 255, g: g * 255, b: b * 255};
}

@Component({
  selector: 'value-display',
  templateUrl: './valuedisplay.component.html',
  styleUrls: ['./valuedisplay.component.scss'],
})
export class ValuedisplayComponent implements OnInit {

  @Input('name') public name:string = "";
  @Input('icon') public icon:string = "";
  @Input('unit') public unit:string = "";
  @Input('scale-min') public scale_min:string = "0";
  @Input('scale-max') public scale_max:string = "0";
  public limit_min:number = 0;
  public limit_max:number = 0;
  public isNaN = isNaN;

  private color_ok = {
    r: 0x67,
    g: 0xBE,
    b: 0x59
  };
  private color_low = {
    r: 0x4b,
    g: 0xb7,
    b: 0xe9
  };
  private color_high = {
    r: 0xe9,
    g: 0x4b,
    b: 0x4b
  };

  public arc_end = {
    x: 0,
    y: 0,
    long: 0,
  };

  public value:any;
  public value_arc:any;
  public limit_arc:any;

  public rot_min:any;
  public rot_max:any;
  public rot_value:any;
  public color:any;
  public color_limit:any;

  constructor() { }

  ngOnInit() {
    this.updateLimits();
    this.updateColor();
  }

  @Input('limit-min') set setMin(min: number) {
    this.limit_min = min;
    this.updateLimits();
  }

  @Input('limit-max') set setMax(max: number) {
    this.limit_max = max;
    this.updateLimits();
  }

  @Input('average-value') public average_value: any;
  @Input('target-value') public target_value: any;

  private updateLimits() {
    const scale_min = parseFloat(this.scale_min)
    const scale_max = parseFloat(this.scale_max)

    let rads_limit_min = (this.limit_min - scale_min) / (scale_max - scale_min);
    let rads_limit_max = (this.limit_max - scale_min) / (scale_max - scale_min);

    this.rot_min = rads_limit_min * 360 - 92;
    this.rot_max = rads_limit_max * 360 - 92;

    this.limit_arc = calcArc(175, 250, 250, rads_limit_min, rads_limit_max);
    this.color_limit = `rgb(${this.color_ok.r},${this.color_ok.g},${this.color_ok.b})`;
  }

  @Input('value') set setValue(value: number) {
    this.value = value;
    this.updateColor();
  }

  updateColor() {
    const scale_min = parseFloat(this.scale_min)
    const scale_max = parseFloat(this.scale_max)

    let rads_value = (this.value - scale_min) / (scale_max - scale_min);
    rads_value = rads_value > 0.999 ? 0.999 : rads_value;

    this.rot_value = rads_value * 360 - 90;

    this.value_arc = calcArc(190, 250, 250, 0.0, rads_value);

    let diff = this.limit_max - this.limit_min
    let color;

    if(this.value > this.limit_max) {
      color = hslToRgb(mix(
        rgbToHsl(this.color_ok),
        rgbToHsl(this.color_high),
        clamp((this.value - this.limit_max) / diff, 0, 1)
      ));
    }
    else if(this.value < this.limit_min) {
      color = hslToRgb(mix(
        rgbToHsl(this.color_ok),
        rgbToHsl(this.color_low),
        clamp((this.limit_min - this.value) / diff, 0, 1)
      ));
    }
    else {
      color = this.color_ok;
    }

    this.color = `rgb(${color.r},${color.g},${color.b})`;
  }



}
