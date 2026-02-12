import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, Platform } from 'react-native';
import { Text, Card, Title, Paragraph, ProgressBar, MD3Colors, Provider as PaperProvider } from 'react-native-paper';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as FileSystem from 'expo-file-system';

export default function App() {
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [batteryState, setBatteryState] = useState(Battery.BatteryState.UNKNOWN);
  const [storage, setStorage] = useState({ total: 0, free: 0 });
  const [memory, setMemory] = useState(0);

  useEffect(() => {
    let batterySubscription: Battery.Subscription;

    const updateInfo = async () => {
      // 1. 獲取電量
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);
      const state = await Battery.getBatteryStateAsync();
      setBatteryState(state);

      // 2. 獲取儲存空間 (以 GB 為單位)
      const free = await FileSystem.getFreeDiskStorageAsync();
      const total = await FileSystem.getTotalDiskStorageAsync();
      setStorage({
        free: Math.round(free / (1024 ** 3) * 100) / 100,
        total: Math.round(total / (1024 ** 3) * 100) / 100
      });

      // 3. 獲取總記憶體 (以 GB 為單位)
      if (Device.totalMemory) {
        setMemory(Math.round(Device.totalMemory / (1024 ** 3) * 100) / 100);
      }
    };

    updateInfo();

    // 監聽電量變化
    batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setBatteryLevel(batteryLevel);
    });

    const interval = setInterval(updateInfo, 5000); // 每 5 秒更新一次儲存資訊

    return () => {
      batterySubscription?.remove();
      clearInterval(interval);
    };
  }, []);

  const getBatteryStateText = (state: Battery.BatteryState) => {
    switch (state) {
      case Battery.BatteryState.CHARGING: return '充電中';
      case Battery.BatteryState.FULL: return '已充滿';
      case Battery.BatteryState.UNPLUGGED: return '未接電源';
      default: return '未知';
    }
  };

  return (
    <PaperProvider>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.mainTitle}>Android 系統監測</Text>

          {/* 電量卡片 */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>電池狀態</Title>
              <View style={styles.row}>
                <Paragraph>{Math.round(batteryLevel * 100)}%</Paragraph>
                <Paragraph>{getBatteryStateText(batteryState)}</Paragraph>
              </View>
              <ProgressBar progress={batteryLevel} color={MD3Colors.primary50} style={styles.progress} />
            </Card.Content>
          </Card>

          {/* 儲存空間卡片 */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>儲存空間 (GB)</Title>
              <Paragraph>剩餘: {storage.free} GB / 總共: {storage.total} GB</Paragraph>
              <ProgressBar 
                progress={storage.total > 0 ? (storage.total - storage.free) / storage.total : 0} 
                color={MD3Colors.error50} 
                style={styles.progress} 
              />
            </Card.Content>
          </Card>

          {/* 記憶體與硬體 */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>硬體資訊</Title>
              <View style={styles.infoRow}>
                <Text style={styles.label}>裝置名稱:</Text>
                <Text>{Device.modelName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>安卓版本:</Text>
                <Text>{Device.osVersion}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>總計記憶體:</Text>
                <Text>{memory} GB</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>CPU 核心數:</Text>
                <Text>{Platform.select({ android: '讀取中...', default: 'N/A' })}</Text>
              </View>
            </Card.Content>
          </Card>

          <Text style={styles.footer}>* 每 5 秒自動更新數據</Text>
        </ScrollView>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  scrollContent: {
    padding: 16,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#6200ee',
  },
  card: {
    marginBottom: 16,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    paddingBottom: 4,
  },
  label: {
    fontWeight: 'bold',
    width: 100,
  },
  progress: {
    height: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  footer: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    fontSize: 12,
  },
});
