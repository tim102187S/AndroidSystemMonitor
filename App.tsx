import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, Platform, RefreshControl, useColorScheme, Linking } from 'react-native';
import { 
  Text, Card, Title, ProgressBar, MD3Colors, 
  Provider as PaperProvider, MD3DarkTheme, MD3LightTheme,
  IconButton, List, Modal, Portal, Button, Divider, TextInput
} from 'react-native-paper';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const DonutChart = ({ percentage, color, label, size = 95, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle cx="50%" cy="50%" r={radius} stroke="#e0e0e0" strokeWidth={strokeWidth} fill="transparent" />
          <Circle cx="50%" cy="50%" r={radius} stroke={color} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
        </G>
        <SvgText x="50%" y="50%" fill={color} fontSize="14" fontWeight="bold" textAnchor="middle" alignmentBaseline="central">{Math.round(percentage)}%</SvgText>
      </Svg>
      <Text style={{ marginTop: 8, fontWeight: 'bold', fontSize: 11 }}>{label}</Text>
    </View>
  );
};

export default function App() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(false);
  
  const [battery, setBattery] = useState({ level: 0, state: Battery.BatteryState.UNKNOWN });
  const [storage, setStorage] = useState({ total: 0, free: 0 });
  const [memory, setMemory] = useState({ total: 0, used: 0 });
  const [network, setNetwork] = useState({ type: '未知', ip: '...', isConnected: false, ssid: '未知' });
  const [weather, setWeather] = useState({ temp: '--', desc: '讀取中...', city: '偵測位置中' });
  const [device, setDevice] = useState({ model: '...', version: '...', brand: '...', uptime: '...', cpu: '...', api: 0 });
  
  const [currentStepCount, setCurrentStepCount] = useState(0);
  const [stepGoal, setStepGoal] = useState(6000);

  const theme = isDarkMode ? MD3DarkTheme : MD3LightTheme;

  const fetchWeather = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let location = await Location.getCurrentPositionAsync({});
      setWeather({ temp: '24°C', desc: '晴時多雲', city: '目前所在地' });
    } catch (e) {}
  };

  const fetchData = useCallback(async () => {
    try {
      const bLevel = await Battery.getBatteryLevelAsync();
      const bState = await Battery.getBatteryStateAsync();
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const stepResult = await Pedometer.getStepCountAsync(start, new Date());
      setCurrentStepCount(stepResult.steps);
      const totalDisk = await DeviceInfo.getTotalDiskCapacity();
      const freeDisk = await DeviceInfo.getFreeDiskStorage();
      const totalMem = await DeviceInfo.getTotalMemory();
      const usedMem = await DeviceInfo.getUsedMemory();
      const net = await NetInfo.fetch();
      const ip = await DeviceInfo.getIpAddress();
      const ssid = await DeviceInfo.getSsid();
      const uptimeMs = await DeviceInfo.getUptime();
      setBattery({ level: bLevel, state: bState });
      setStorage({ total: totalDisk, free: freeDisk });
      setMemory({ total: totalMem, used: usedMem });
      setNetwork({ type: net.type, ip, isConnected: net.isConnected ?? false, ssid: ssid || '隱藏' });
      setDevice({
        model: DeviceInfo.getModel(),
        version: DeviceInfo.getSystemVersion(),
        brand: DeviceInfo.getBrand(),
        uptime: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`,
        cpu: await DeviceInfo.getHardware(),
        api: await DeviceInfo.getApiLevel()
      });
      fetchWeather();
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <PaperProvider theme={theme}>
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={[styles.modal, {backgroundColor: theme.colors.surface}]}>
          <Title style={{textAlign: 'center'}}>進階硬體規格</Title>
          <ScrollView>
            <List.Item title="製造商" description={device.brand} left={p => <List.Icon {...p} icon="factory" />} />
            <List.Item title="核心架構" description={device.cpu} left={p => <List.Icon {...p} icon="cpu-64-bit" />} />
            <List.Item title="Android API" description={device.api.toString()} left={p => <List.Icon {...p} icon="android" />} />
            <List.Item title="開機時長" description={device.uptime} left={p => <List.Icon {...p} icon="clock-outline" />} />
          </ScrollView>
          <Button mode="contained" onPress={() => setVisible(false)} style={{marginTop: 10}}>關閉視窗</Button>
        </Modal>
      </Portal>

      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <Title style={{ color: theme.colors.primary, fontWeight: 'bold' }}>系統工具箱 v6.1</Title>
          <IconButton icon={isDarkMode ? "weather-sunny" : "weather-night"} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setIsDarkMode(!isDarkMode); }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRefreshing(true); await fetchData(); setRefreshing(false); }} />}>
          
          <Card style={[styles.card, {backgroundColor: isDarkMode ? '#1e293b' : '#e0f2fe'}]}>
            <Card.Content style={styles.weatherRow}>
              <View>
                <Text variant="titleLarge" style={{fontWeight: 'bold'}}>{weather.city}</Text>
                <Text variant="bodyMedium">{weather.desc}</Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text variant="displaySmall" style={{fontWeight: 'bold', color: MD3Colors.primary40}}>{weather.temp}</Text>
                <Text variant="bodySmall">最後更新: 剛才</Text>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.toolRow}>
                <View style={styles.toolItem}>
                  <IconButton icon="wifi-cog" mode="outlined" size={28} onPress={() => Linking.sendIntent('android.settings.WIFI_SETTINGS')} />
                  <Text variant="labelSmall">Wi-Fi</Text>
                </View>
                <View style={styles.toolItem}>
                  <IconButton icon="brightness-6" mode="outlined" size={28} onPress={() => Linking.sendIntent('android.settings.DISPLAY_SETTINGS')} />
                  <Text variant="labelSmall">亮度</Text>
                </View>
                <View style={styles.toolItem}>
                  <IconButton icon="information-outline" mode="outlined" size={28} onPress={() => setVisible(true)} />
                  <Text variant="labelSmall">詳情</Text>
                </View>
                <View style={styles.toolItem}>
                  <IconButton icon="refresh" mode="outlined" size={28} onPress={() => fetchData()} />
                  <Text variant="labelSmall">重新整理</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.donutContainer}>
                <DonutChart label="今日步數" percentage={stepGoal > 0 ? (currentStepCount / stepGoal) * 100 : 0} color="#2196F3" />
                <View style={{ justifyContent: 'center' }}>
                  <Text variant="titleLarge" style={{fontWeight: 'bold'}}>{currentStepCount} 步</Text>
                  <Text variant="bodySmall">目標 {stepGoal} 步</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.donutContainer}>
                <DonutChart label="儲存空間" percentage={storage.total > 0 ? ((storage.total - storage.free) / storage.total) * 100 : 0} color="#4CAF50" />
                <DonutChart label="記憶體" percentage={memory.total > 0 ? (memory.used / memory.total) * 100 : 0} color="#FF9800" />
              </View>
              <ProgressBar progress={battery.level} color={MD3Colors.primary50} style={{marginTop: 15, height: 10, borderRadius: 5}} />
              <Paragraph style={{textAlign: 'center', fontSize: 12, marginTop: 5}}>剩餘電力: {Math.round(battery.level * 100)}%</Paragraph>
            </Card.Content>
          </Card>

          <Text style={styles.footer}>* v6.1 已暫時移除手電筒以確保穩定性</Text>
        </ScrollView>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  scrollContent: { padding: 16 },
  card: { marginBottom: 16, borderRadius: 20, elevation: 4 },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  donutContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
  toolRow: { flexDirection: 'row', justifyContent: 'space-around' },
  toolItem: { alignItems: 'center' },
  modal: { margin: 20, padding: 25, borderRadius: 20 },
  footer: { textAlign: 'center', color: '#999', marginVertical: 20 },
});
