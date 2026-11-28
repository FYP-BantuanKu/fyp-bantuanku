import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ApplicationsScreen from "../screens/applications/ApplicationsScreen";
import StrApplicationScreen from "../screens/applications/str/StrApplicationScreen";
import JkmApplicationScreen from "../screens/applications/jkm/JkmApplicationScreen";
import type { JkmProgramCode } from "../types/applications";

export type ApplicationsStackParamList = {
  ApplicationsScreen: undefined;

  StrApplication: {
    applicationId?: string;
  } | undefined;

  JkmApplication: {
    programCode: JkmProgramCode;
    applicationId?: string;
  };
};

type JkmApplicationRouteProps = NativeStackScreenProps<
    ApplicationsStackParamList,
    "JkmApplication"
>;

function JkmApplicationRoute({
    route
}: JkmApplicationRouteProps) {
  return (
      <JkmApplicationScreen
          programCode={route.params.programCode}
          applicationId={route.params.applicationId}
      />
  );
}

const Stack = createNativeStackNavigator<ApplicationsStackParamList>();

export default function ApplicationsStackNavigator() {
  return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
            name="ApplicationsScreen"
            component={ApplicationsScreen}
        />

        <Stack.Screen
            name="StrApplication"
            component={StrApplicationScreen}
        />

        <Stack.Screen
            name="JkmApplication"
            component={JkmApplicationRoute}
        />
      </Stack.Navigator>
  );
}
