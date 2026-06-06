import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// 从环境变量获取 Supabase 配置
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// 获取记录列表
router.get('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ records: [], error: '数据库未配置' });
    }
    
    const deviceId = req.query.device_id as string;
    
    let query = supabase
      .from('polish_records')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }
    
    const { data, error } = await query;

    if (error) throw error;
    res.json({ records: data || [] });
  } catch (err: any) {
    console.error('获取记录失败:', err);
    res.status(500).json({ error: err.message || '获取记录失败' });
  }
});

// 添加记录
router.post('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ record: null, error: '数据库未配置' });
    }
    
    const { device_id, input_text, polished_text, style, image_url } = req.body;

    const { data, error } = await supabase
      .from('polish_records')
      .insert({
        device_id,
        input_text,
        polished_text,
        style,
        image_url,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ record: data });
  } catch (err: any) {
    console.error('添加记录失败:', err);
    res.status(500).json({ error: err.message || '添加记录失败' });
  }
});

// 删除记录
router.delete('/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: '数据库未配置' });
    }
    
    const { id } = req.params;

    const { error } = await supabase
      .from('polish_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('删除记录失败:', err);
    res.status(500).json({ error: err.message || '删除记录失败' });
  }
});

// 清空所有记录
router.delete('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: '数据库未配置' });
    }
    
    const deviceId = req.query.device_id as string;
    
    if (deviceId) {
      const { error } = await supabase
        .from('polish_records')
        .delete()
        .eq('device_id', deviceId);
      
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('清空记录失败:', err);
    res.status(500).json({ error: err.message || '清空记录失败' });
  }
});

export default router;
