/* SPDX-License-Identifier: MIT */
package fr.yapapouaiye.controls;
public final class GammaRange {
    private GammaRange() { }
    public static double bounded(double value) { return Double.isFinite(value)?Math.max(0,Math.min(1,value)):1.0; }
}
