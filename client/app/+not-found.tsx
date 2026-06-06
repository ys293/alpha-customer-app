import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.message}>页面不存在</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F3',
  },
  title: {
    fontSize: 72,
    fontWeight: '800',
    color: '#6C63FF',
  },
  message: {
    fontSize: 18,
    color: '#636E72',
    marginTop: 12,
  },
});
