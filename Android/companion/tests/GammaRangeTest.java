package fr.yapapouaiye.controls;
public final class GammaRangeTest {
    public static void main(String[] args) {
        double[] inputs={0,0.5,1,100,-4,Double.NaN,Double.POSITIVE_INFINITY};
        double[] expected={0,0.5,1,1,0,1,1};
        for(int i=0;i<inputs.length;i++)if(GammaRange.bounded(inputs[i])!=expected[i])throw new AssertionError("Brightness bound "+i);
        for(int i=0;i<10000;i++){double value=GammaRange.bounded(100);if(value<0||value>1||!Double.isFinite(value))throw new AssertionError("Repeated FullBright validation");}
        System.out.println("GammaRange: valid brightness preserved; invalid and repeated FullBright values bounded");
    }
}
